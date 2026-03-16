import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { createHash } from "crypto";
import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { getConvexClient } from "./convex-client";
import { paperDir } from "./constants";

const execFileAsync = promisify(execFile);

export const EVIDENCE_INDEX_VERSION = 1;
export const EVIDENCE_EXTRACTOR_VERSION = "pdftotext-paragraph-v1";
const EVIDENCE_INDEX_FILENAME = "evidence-index.jsonl";
const EVIDENCE_MANIFEST_FILENAME = "evidence-index.meta.json";
const MAX_CHUNK_CHARS = 650;
const MIN_CHUNK_CHARS = 24;
const CONTEXT_CHARS = 96;

interface SectionIndexEntry {
  title: string;
}

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

export interface EvidenceIndexManifest {
  version: number;
  extractorVersion: string;
  builtAt: string;
  chunkCount: number;
  sourcePdf: string;
}

interface BuiltEvidenceIndex {
  manifest: EvidenceIndexManifest;
  chunks: EvidenceChunkRecord[];
  indexPath: string;
  manifestPath: string;
}

export interface EnsuredEvidenceIndex {
  paperId: Id<"papers">;
  indexVersion: number;
  extractorVersion: string;
  chunkCount: number;
  indexPath: string;
}

function cleanEvidenceText(text: string): string {
  return text
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

function extractSectionTitles(sectionIndex: unknown): string[] {
  if (
    !sectionIndex ||
    typeof sectionIndex !== "object" ||
    !("sections" in sectionIndex) ||
    !Array.isArray((sectionIndex as { sections?: unknown[] }).sections)
  ) {
    return [];
  }

  const titles = new Set<string>();
  for (const section of (sectionIndex as { sections: SectionIndexEntry[] }).sections) {
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

function buildChunkRefId(
  sanitizedId: string,
  page: number,
  order: number,
  normText: string,
  start?: number
): string {
  const digest = createHash("sha1")
    .update(`${sanitizedId}:${page}:${start ?? order}:${normText}`)
    .digest("hex")
    .slice(0, 10);
  return `${chunkRefNamespace(sanitizedId)}_p${String(page).padStart(3, "0")}_${digest}`;
}

function buildPageChunks(
  sanitizedId: string,
  pageNumber: number,
  rawPageText: string,
  knownTitles: string[],
  startingSection?: string
): { chunks: EvidenceChunkRecord[]; currentSection?: string } {
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

    currentSection = detectSectionTitle(blockText, knownTitles, currentSection);

    for (const chunkText of splitLongChunk(blockText)) {
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
          ? pageText.slice(Math.max(0, start - CONTEXT_CHARS), start).trim()
          : undefined;
      const suffix =
        end !== undefined
          ? pageText.slice(end, Math.min(pageText.length, end + CONTEXT_CHARS)).trim()
          : undefined;

      chunks.push({
        refId: buildChunkRefId(sanitizedId, pageNumber, order, normText, start >= 0 ? start : undefined),
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

async function readSectionTitles(paperPath: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(
      path.join(paperPath, "source", ".section-index.json"),
      "utf-8"
    );
    return extractSectionTitles(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function extractPdfPages(pdfPath: string): Promise<string[]> {
  try {
    const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"]);
    const pages = stdout.split("\f");
    if (pages.length > 1 && pages[pages.length - 1]?.trim() === "") {
      pages.pop();
    }
    return pages;
  } catch (error) {
    throw new Error(
      `Failed to extract PDF text with pdftotext: ${
        error instanceof Error ? error.message : "unknown error"
      }`
    );
  }
}

function evidenceIndexPath(sanitizedId: string): string {
  return path.join(paperDir(sanitizedId), EVIDENCE_INDEX_FILENAME);
}

function evidenceManifestPath(sanitizedId: string): string {
  return path.join(paperDir(sanitizedId), EVIDENCE_MANIFEST_FILENAME);
}

export function evidenceIndexRelativePath(sanitizedId: string): string {
  return `papers/${sanitizedId}/${EVIDENCE_INDEX_FILENAME}`;
}

async function readBuiltEvidenceIndex(
  sanitizedId: string
): Promise<BuiltEvidenceIndex | null> {
  try {
    const indexPath = evidenceIndexPath(sanitizedId);
    const manifestPath = evidenceManifestPath(sanitizedId);
    const [manifestRaw, indexRaw] = await Promise.all([
      fs.readFile(manifestPath, "utf-8"),
      fs.readFile(indexPath, "utf-8"),
    ]);

    const manifest = JSON.parse(manifestRaw) as EvidenceIndexManifest;
    const chunks = indexRaw
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EvidenceChunkRecord);

    return { manifest, chunks, indexPath, manifestPath };
  } catch {
    return null;
  }
}

async function writeBuiltEvidenceIndex(
  sanitizedId: string,
  built: BuiltEvidenceIndex
): Promise<void> {
  const paperPath = paperDir(sanitizedId);
  await fs.mkdir(paperPath, { recursive: true });
  await Promise.all([
    fs.writeFile(
      built.indexPath,
      built.chunks.map((chunk) => JSON.stringify(chunk)).join("\n") + "\n"
    ),
    fs.writeFile(
      built.manifestPath,
      JSON.stringify(built.manifest, null, 2)
    ),
  ]);
}

export async function buildEvidenceIndex(
  sanitizedId: string
): Promise<BuiltEvidenceIndex> {
  const paperPath = paperDir(sanitizedId);
  const pdfPath = path.join(paperPath, "paper.pdf");
  const knownTitles = await readSectionTitles(paperPath);
  const pages = await extractPdfPages(pdfPath);

  const chunks: EvidenceChunkRecord[] = [];
  let currentSection: string | undefined;
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const pageNumber = pageIndex + 1;
    const result = buildPageChunks(
      sanitizedId,
      pageNumber,
      pages[pageIndex] ?? "",
      knownTitles,
      currentSection
    );
    currentSection = result.currentSection;
    chunks.push(...result.chunks);
  }

  const builtAt = new Date().toISOString();
  const built: BuiltEvidenceIndex = {
    manifest: {
      version: EVIDENCE_INDEX_VERSION,
      extractorVersion: EVIDENCE_EXTRACTOR_VERSION,
      builtAt,
      chunkCount: chunks.length,
      sourcePdf: "paper.pdf",
    },
    chunks,
    indexPath: evidenceIndexPath(sanitizedId),
    manifestPath: evidenceManifestPath(sanitizedId),
  };

  await writeBuiltEvidenceIndex(sanitizedId, built);
  return built;
}

export async function ensurePaperEvidenceIndex(
  sanitizedId: string,
  convex: ConvexHttpClient = getConvexClient()
): Promise<EnsuredEvidenceIndex> {
  const paper = await convex.query(api.papers.get, { sanitizedId });
  if (!paper) {
    throw new Error(`Paper ${sanitizedId} not found in Convex`);
  }

  const activeIndex = await convex.query(api.paperIndexes.getActiveForPaper, {
    paperId: paper._id,
  });
  const cached = await readBuiltEvidenceIndex(sanitizedId);
  const cacheMatchesCurrentVersion =
    cached?.manifest.version === EVIDENCE_INDEX_VERSION &&
    cached.manifest.extractorVersion === EVIDENCE_EXTRACTOR_VERSION;

  if (
    activeIndex &&
    cacheMatchesCurrentVersion &&
    activeIndex.version === EVIDENCE_INDEX_VERSION &&
    activeIndex.extractorVersion === EVIDENCE_EXTRACTOR_VERSION
  ) {
    return {
      paperId: paper._id,
      indexVersion: activeIndex.version,
      extractorVersion: activeIndex.extractorVersion,
      chunkCount: cached!.manifest.chunkCount,
      indexPath: cached!.indexPath,
    };
  }

  const built = cacheMatchesCurrentVersion
    ? cached!
    : await buildEvidenceIndex(sanitizedId);

  await convex.mutation(api.paperIndexes.create, {
    paperId: paper._id,
    version: built.manifest.version,
    extractorVersion: built.manifest.extractorVersion,
    createdAt: built.manifest.builtAt,
  });

  await convex.mutation(api.paperChunks.replaceForIndex, {
    paperId: paper._id,
    indexVersion: built.manifest.version,
    chunks: built.chunks,
  });

  return {
    paperId: paper._id,
    indexVersion: built.manifest.version,
    extractorVersion: built.manifest.extractorVersion,
    chunkCount: built.manifest.chunkCount,
    indexPath: built.indexPath,
  };
}
