export interface OutlineSourceFile {
  relativePath: string;
  content: string;
  fileType: string;
}

export interface SectionOutlineEntry {
  title: string;
  startPage: number;
}

const EXCLUDED_TITLES = new Set([
  "references",
  "bibliography",
  "acknowledgments",
  "acknowledgements",
]);

const COMMON_FALLBACK_TITLES = new Set([
  "introduction",
  "background",
  "preliminaries",
  "related work",
  "method",
  "methods",
  "methodology",
  "approach",
  "approaches",
  "experimental setup",
  "experiments",
  "evaluation",
  "results",
  "discussion",
  "limitations",
  "conclusion",
  "conclusions",
  "appendix",
]);

const HEADING_NOISE_PREFIXES = [
  "figure",
  "table",
  "algorithm",
  "arxiv",
  "http",
  "proceedings",
];

function stripTexComments(content: string): string {
  return content
    .split("\n")
    .map((line) => {
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== "%") continue;
        if (i > 0 && line[i - 1] === "\\") continue;
        return line.slice(0, i);
      }
      return line;
    })
    .join("\n");
}

function getDocumentBody(content: string): string {
  const start = content.indexOf("\\begin{document}");
  if (start < 0) return content;

  const end = content.indexOf("\\end{document}", start);
  return end < 0 ? content.slice(start) : content.slice(start, end);
}

function readBalancedGroup(
  content: string,
  start: number,
  openChar: string,
  closeChar: string,
): { value: string; end: number } | null {
  if (content[start] !== openChar) return null;

  let depth = 0;
  let value = "";

  for (let i = start; i < content.length; i++) {
    const char = content[i];
    if (char === openChar) {
      depth += 1;
      if (depth > 1) value += char;
      continue;
    }
    if (char === closeChar) {
      depth -= 1;
      if (depth === 0) {
        return { value, end: i + 1 };
      }
      value += char;
      continue;
    }
    value += char;
  }

  return null;
}

function unwrapTexFormatting(value: string): string {
  let output = value;
  let previous = "";

  while (output !== previous) {
    previous = output;
    output = output.replace(
      /\\[a-zA-Z]+\*?(?:\[[^\]]*\])?\{([^{}]*)\}/g,
      " $1 ",
    );
  }

  return output;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function stripHeadingPrefix(value: string): string {
  return value.replace(
    /^(?:section\s+)?(?:(?:appendix\s+[a-z0-9]+)|(?:[0-9ivxlcdm]+(?:\.[0-9ivxlcdm]+)*))(?:[.)]|\s)+/i,
    "",
  );
}

function sanitizeSectionTitle(rawTitle: string): string {
  const unwrapped = unwrapTexFormatting(rawTitle)
    .replace(/\$[^$]*\$/g, " ")
    .replace(/\\([#$%&_{}])/g, "$1")
    .replace(/\\(?:label|ref|cite|footnote)\*?(?:\[[^\]]*\])?\{[^{}]*\}/g, " ")
    .replace(/\\[a-zA-Z]+\*?(?:\[[^\]]*\])?/g, " ")
    .replace(/\\./g, " ")
    .replace(/[{}~]/g, " ");

  return normalizeWhitespace(unwrapped).replace(/[.:;,\-]+$/, "").trim();
}

function canonicalizeTitle(value: string): string {
  return stripHeadingPrefix(sanitizeSectionTitle(value))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isExcludedTitle(title: string): boolean {
  const normalized = canonicalizeTitle(title);
  return EXCLUDED_TITLES.has(normalized);
}

function dedupeTitles(titles: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const title of titles) {
    const canonical = canonicalizeTitle(title);
    if (!canonical || seen.has(canonical) || isExcludedTitle(title)) continue;
    seen.add(canonical);
    deduped.push(normalizeWhitespace(title));
  }

  return deduped;
}

function compareTexCandidates(
  left: { relativePath: string; titles: string[]; hasDocument: boolean },
  right: { relativePath: string; titles: string[]; hasDocument: boolean },
): number {
  if (left.hasDocument !== right.hasDocument) {
    return left.hasDocument ? -1 : 1;
  }
  if (left.titles.length !== right.titles.length) {
    return right.titles.length - left.titles.length;
  }

  const leftIsMain = left.relativePath.toLowerCase().endsWith("main.tex");
  const rightIsMain = right.relativePath.toLowerCase().endsWith("main.tex");
  if (leftIsMain !== rightIsMain) {
    return leftIsMain ? -1 : 1;
  }

  return left.relativePath.length - right.relativePath.length;
}

function extractTitlesFromTexContent(content: string): string[] {
  const body = getDocumentBody(stripTexComments(content));
  const titles: string[] = [];

  for (let index = 0; index < body.length; index++) {
    if (body[index] !== "\\") continue;

    let cursor = index + 1;
    let command = "";
    while (cursor < body.length && /[a-zA-Z]/.test(body[cursor] ?? "")) {
      command += body[cursor];
      cursor += 1;
    }

    if (!command) continue;

    if (command === "appendix") {
      index = cursor - 1;
      continue;
    }

    if (command !== "section") continue;

    if (body[cursor] === "*") cursor += 1;
    while (cursor < body.length && /\s/.test(body[cursor] ?? "")) {
      cursor += 1;
    }

    if (body[cursor] === "[") {
      const optionalGroup = readBalancedGroup(body, cursor, "[", "]");
      if (!optionalGroup) continue;
      cursor = optionalGroup.end;
      while (cursor < body.length && /\s/.test(body[cursor] ?? "")) {
        cursor += 1;
      }
    }

    if (body[cursor] !== "{") continue;

    const titleGroup = readBalancedGroup(body, cursor, "{", "}");
    if (!titleGroup) continue;

    const title = sanitizeSectionTitle(titleGroup.value);
    if (title && !isExcludedTitle(title)) {
      titles.push(title);
    }

    index = titleGroup.end - 1;
  }

  return dedupeTitles(titles);
}

export function extractTopLevelSectionTitles(
  sourceFiles: OutlineSourceFile[],
): string[] {
  const texFiles = sourceFiles.filter(
    (file) => file.fileType === "tex" && file.content.trim().length > 0,
  );
  if (texFiles.length === 0) return [];

  const candidates = texFiles
    .map((file) => ({
      relativePath: file.relativePath,
      hasDocument: file.content.includes("\\begin{document}"),
      titles: extractTitlesFromTexContent(file.content),
    }))
    .filter((candidate) => candidate.titles.length > 0);

  if (candidates.length === 0) return [];

  candidates.sort(compareTexCandidates);
  return candidates[0]?.titles ?? [];
}

function splitPageLines(pageText: string): string[] {
  return pageText
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function looksLikeHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 140) return false;
  if (/[.!?]$/.test(trimmed) && trimmed.split(/\s+/).length > 8) return false;
  if (trimmed.includes("@")) return false;

  const lower = trimmed.toLowerCase();
  if (HEADING_NOISE_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
    return false;
  }

  return true;
}

function lineMatchesTitle(line: string, title: string): boolean {
  if (!looksLikeHeadingLine(line)) return false;

  const canonicalLine = canonicalizeTitle(line);
  if (!canonicalLine) return false;

  if (canonicalLine === title) return true;
  if (canonicalLine.startsWith(`${title} `)) return true;
  if (canonicalLine.endsWith(` ${title}`)) return true;

  return false;
}

export function mapSectionTitlesToPages(
  pageTexts: string[],
  titles: string[],
): SectionOutlineEntry[] {
  const dedupedTitles = dedupeTitles(titles);
  const outline: SectionOutlineEntry[] = [];
  const seenPages = new Set<string>();
  let startPageIndex = 0;

  for (const title of dedupedTitles) {
    const canonicalTitle = canonicalizeTitle(title);
    if (!canonicalTitle) continue;

    for (let pageIndex = startPageIndex; pageIndex < pageTexts.length; pageIndex++) {
      const lines = splitPageLines(pageTexts[pageIndex] ?? "");
      const matched = lines.some((line) => lineMatchesTitle(line, canonicalTitle));
      if (!matched) continue;

      const key = `${canonicalTitle}:${pageIndex + 1}`;
      if (!seenPages.has(key)) {
        outline.push({
          title,
          startPage: pageIndex + 1,
        });
        seenPages.add(key);
      }
      startPageIndex = pageIndex;
      break;
    }
  }

  return outline;
}

function isNumberedHeading(line: string): boolean {
  return /^(?:appendix\s+[a-z0-9]+|[0-9ivxlcdm]+(?:\.[0-9ivxlcdm]+)*)(?:[.)]|\s)/i.test(
    line,
  );
}

function cleanPdfHeading(line: string): string {
  const withoutTrailingPage = line.replace(/\s+\d+\s*$/, "");
  return normalizeWhitespace(withoutTrailingPage).replace(/[.:;,\-]+$/, "");
}

function isFallbackHeading(line: string): boolean {
  if (!looksLikeHeadingLine(line)) return false;

  const canonical = canonicalizeTitle(line);
  if (!canonical || isExcludedTitle(canonical)) return false;

  if (isNumberedHeading(line)) return true;
  return COMMON_FALLBACK_TITLES.has(canonical);
}

export function extractOutlineFromPdf(
  pageTexts: string[],
): SectionOutlineEntry[] {
  const outline: SectionOutlineEntry[] = [];
  const seen = new Set<string>();

  for (let pageIndex = 0; pageIndex < pageTexts.length; pageIndex++) {
    const lines = splitPageLines(pageTexts[pageIndex] ?? "");
    for (const line of lines) {
      if (!isFallbackHeading(line)) continue;

      const title = cleanPdfHeading(line);
      const canonical = canonicalizeTitle(title);
      if (!canonical || seen.has(canonical) || isExcludedTitle(title)) continue;

      seen.add(canonical);
      outline.push({
        title,
        startPage: pageIndex + 1,
      });
    }
  }

  return outline.length >= 2 ? outline : [];
}
