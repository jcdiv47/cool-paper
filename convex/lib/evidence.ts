/**
 * Pure evidence chunking functions extracted from src/lib/evidence-index.ts.
 * No filesystem or Node.js dependencies — safe for Convex actions.
 */

export const EVIDENCE_INDEX_VERSION = 1;
export const EVIDENCE_EXTRACTOR_VERSION = "pdfjs-paragraph-v1";
const MAX_CHUNK_CHARS = 650;
const MIN_CHUNK_CHARS = 24;
const CONTEXT_CHARS = 96;

export interface EvidenceChunkRecord {
  refId: string;
  page: number;
  order: number;
  section?: string;
  text: string;
  normText: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
}

function toWellFormedText(text: string): string {
  if (typeof (text as unknown as { toWellFormed?: () => string }).toWellFormed === "function") {
    return (text as unknown as { toWellFormed: () => string }).toWellFormed();
  }

  let out = "";
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);

    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += text[i]! + text[i + 1]!;
        i++;
      } else {
        out += "\uFFFD";
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      out += "\uFFFD";
      continue;
    }

    out += text[i]!;
  }

  return out;
}

function cleanEvidenceText(text: string): string {
  return toWellFormedText(text)
    .replace(/\r/g, "")
    .replace(/\u0000/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeEvidenceText(text: string): string {
  return cleanEvidenceText(text).toLowerCase();
}

function normalizeHeading(text: string): string {
  return cleanEvidenceText(text)
    .toLowerCase()
    .replace(/^[\[(]?[0-9ivxlcdm]+(?:[.)]|\s)+(?:\s+)?/i, "")
    .replace(/^(section|appendix)\s+/i, "")
    .replace(/[.:]+$/, "")
    .trim();
}

function sentenceSplit(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9(\[])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function splitLongChunk(text: string): string[] {
  if (text.length <= MAX_CHUNK_CHARS) return [text];

  const sentences = sentenceSplit(text);
  if (sentences.length <= 1) {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += MAX_CHUNK_CHARS) {
      chunks.push(text.slice(i, i + MAX_CHUNK_CHARS).trim());
    }
    return chunks.filter(Boolean);
  }

  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    const next = current ? `${current} ${sentence}` : sentence;
    if (next.length > MAX_CHUNK_CHARS && current) {
      chunks.push(current);
      current = sentence;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function splitIntoBlocks(pageText: string): string[] {
  const lines = pageText.replace(/\r/g, "").split("\n");
  const blocks: string[] = [];
  let current: string[] = [];

  function flush() {
    if (current.length === 0) return;
    blocks.push(current.join("\n"));
    current = [];
  }

  for (const line of lines) {
    if (line.trim() === "") {
      flush();
      continue;
    }
    current.push(line);
  }

  flush();
  return blocks;
}

interface SectionIndexEntry {
  title: string;
}

export function extractSectionTitles(sectionIndex: unknown): string[] {
  if (
    !sectionIndex ||
    typeof sectionIndex !== "object" ||
    !("sections" in sectionIndex) ||
    !Array.isArray((sectionIndex as { sections?: unknown[] }).sections)
  ) {
    return [];
  }

  const titles = new Set<string>();
  for (const section of (sectionIndex as { sections: SectionIndexEntry[] })
    .sections) {
    const title = cleanEvidenceText(section.title);
    if (title) titles.add(title);
  }
  return [...titles];
}

function detectSectionTitle(
  blockText: string,
  knownTitles: string[],
  currentSection?: string
): string | undefined {
  const firstSentence = blockText.split(/[.!?]/, 1)[0] ?? blockText;
  const firstLine = cleanEvidenceText(firstSentence.slice(0, 160));
  const normalizedFirstLine = normalizeHeading(firstLine);

  for (const title of knownTitles) {
    const normalizedTitle = normalizeHeading(title);
    if (!normalizedTitle) continue;

    if (
      normalizedFirstLine === normalizedTitle ||
      normalizedFirstLine.startsWith(`${normalizedTitle} `)
    ) {
      return title;
    }
  }

  return currentSection;
}

function chunkRefNamespace(sanitizedId: string): string {
  return sanitizedId.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Build chunk refId using Web Crypto (SubtleCrypto) compatible SHA-1 */
async function buildChunkRefId(
  sanitizedId: string,
  page: number,
  order: number,
  normText: string,
  start?: number
): Promise<string> {
  const input = `${sanitizedId}:${page}:${start ?? order}:${normText}`;
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const digest = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 10);
  return `${chunkRefNamespace(sanitizedId)}_p${String(page).padStart(3, "0")}_${digest}`;
}

async function buildPageChunks(
  sanitizedId: string,
  pageNumber: number,
  rawPageText: string,
  knownTitles: string[],
  startingSection?: string
): Promise<{ chunks: EvidenceChunkRecord[]; currentSection?: string }> {
  const pageText = cleanEvidenceText(rawPageText);
  const pageNormText = normalizeEvidenceText(rawPageText);
  const blocks = splitIntoBlocks(rawPageText);

  const chunks: EvidenceChunkRecord[] = [];
  let currentSection = startingSection;
  let searchFrom = 0;
  let order = 0;

  for (const block of blocks) {
    const blockText = cleanEvidenceText(block);
    if (blockText.length < MIN_CHUNK_CHARS) continue;

    currentSection = detectSectionTitle(
      blockText,
      knownTitles,
      currentSection
    );

    for (const rawChunkText of splitLongChunk(blockText)) {
      const chunkText = toWellFormedText(rawChunkText).trim();
      if (chunkText.length < MIN_CHUNK_CHARS) continue;
      const normText = normalizeEvidenceText(chunkText);
      if (!normText) continue;

      let start = pageNormText.indexOf(normText, searchFrom);
      if (start < 0) {
        start = pageNormText.indexOf(normText);
      }
      const end = start >= 0 ? start + normText.length : undefined;

      if (start >= 0) {
        searchFrom = start + normText.length;
      }

      const prefix =
        start >= 0
          ? toWellFormedText(
              pageText
                .slice(Math.max(0, start - CONTEXT_CHARS), start)
                .trim(),
            )
          : undefined;
      const suffix =
        end !== undefined
          ? toWellFormedText(
              pageText
                .slice(end, Math.min(pageText.length, end + CONTEXT_CHARS))
                .trim(),
            )
          : undefined;

      const refId = await buildChunkRefId(
        sanitizedId,
        pageNumber,
        order,
        normText,
        start >= 0 ? start : undefined
      );

      chunks.push({
        refId,
        page: pageNumber,
        order: order++,
        section: currentSection,
        text: chunkText,
        normText,
        prefix: prefix || undefined,
        suffix: suffix || undefined,
        start: start >= 0 ? start : undefined,
        end,
      });
    }
  }

  return { chunks, currentSection };
}

/**
 * Build evidence chunks from an array of page texts.
 * @param sanitizedId The sanitized arXiv paper ID
 * @param pageTexts Array of raw text for each page (0-indexed)
 * @param knownTitles Optional list of known section titles
 */
export async function buildEvidenceChunks(
  sanitizedId: string,
  pageTexts: string[],
  knownTitles: string[] = []
): Promise<EvidenceChunkRecord[]> {
  const chunks: EvidenceChunkRecord[] = [];
  let currentSection: string | undefined;

  for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex++) {
    const pageNumber = pageIndex + 1;
    const result = await buildPageChunks(
      sanitizedId,
      pageNumber,
      pageTexts[pageIndex] ?? "",
      knownTitles,
      currentSection
    );
    currentSection = result.currentSection;
    chunks.push(...result.chunks);
  }

  return chunks;
}
