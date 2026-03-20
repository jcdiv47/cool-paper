const VALID_CITATION_TOKEN_REGEX = /\[\[cite:([a-zA-Z0-9_-]+)\]\]/g;
const ANY_CITATION_TOKEN_REGEX = /\[\[cite:([^\]]+)\]\]/g;
const GENERIC_TEX_PATH_REGEX = /\b(?:[\w-]+\/)*[\w.-]+\.tex\b/gi;

export interface DraftClaim {
  id: string;
  text: string;
  groundingQueries: string[];
  optional: boolean;
  paperId?: string;
  section?: string;
}

export interface DraftAnswer {
  lead?: string;
  claims: DraftClaim[];
  closing?: string;
}

export interface SourceFileLeakReport {
  hasLeaks: boolean;
  exactPaths: string[];
  genericPaths: string[];
  malformedCitationTokens: string[];
}

function dedupeStrings(values: string[]) {
  return [...new Set(values)];
}

function sanitizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeGroundingQueries(value: unknown, fallbackText: string): string[] {
  const queries = Array.isArray(value)
    ? value
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];

  if (queries.length > 0) {
    return dedupeStrings(queries.slice(0, 3));
  }

  const fallback = fallbackText.trim();
  return fallback ? [fallback.slice(0, 220)] : [];
}

export function normalizeDraftAnswer(
  value: unknown,
  defaultPaperId?: string,
): DraftAnswer | null {
  if (typeof value !== "object" || value === null) return null;

  const raw = value as {
    lead?: unknown;
    claims?: unknown;
    closing?: unknown;
  };

  const claims = Array.isArray(raw.claims)
    ? raw.claims
        .map((claim, index): DraftClaim | null => {
          if (typeof claim !== "object" || claim === null) return null;
          const rawClaim = claim as {
            id?: unknown;
            text?: unknown;
            groundingQueries?: unknown;
            optional?: unknown;
            paperId?: unknown;
            section?: unknown;
          };
          const text = sanitizeText(rawClaim.text);
          if (!text) return null;

          const groundingQueries = normalizeGroundingQueries(
            rawClaim.groundingQueries,
            text,
          );
          if (groundingQueries.length === 0) return null;

          return {
            id: sanitizeText(rawClaim.id) ?? `claim_${index + 1}`,
            text,
            groundingQueries,
            optional: rawClaim.optional === true,
            paperId: sanitizeText(rawClaim.paperId) ?? defaultPaperId,
            section: sanitizeText(rawClaim.section),
          };
        })
        .filter((claim): claim is DraftClaim => claim !== null)
    : [];

  return {
    lead: sanitizeText(raw.lead),
    claims,
    closing: sanitizeText(raw.closing),
  };
}

function extractJsonCandidate(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf("{");
  const end = source.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return source.slice(start, end + 1);
}

export function parseDraftAnswer(
  text: string,
  defaultPaperId?: string,
): DraftAnswer | null {
  const candidate = extractJsonCandidate(text);
  if (!candidate) return null;

  try {
    return normalizeDraftAnswer(JSON.parse(candidate), defaultPaperId);
  } catch {
    return null;
  }
}

function findMalformedCitationTokens(content: string): string[] {
  const malformed: string[] = [];
  let match: RegExpExecArray | null;

  ANY_CITATION_TOKEN_REGEX.lastIndex = 0;
  while ((match = ANY_CITATION_TOKEN_REGEX.exec(content)) !== null) {
    const token = match[0];
    if (!VALID_CITATION_TOKEN_REGEX.test(token)) {
      malformed.push(token);
    }
    VALID_CITATION_TOKEN_REGEX.lastIndex = 0;
  }
  ANY_CITATION_TOKEN_REGEX.lastIndex = 0;

  return dedupeStrings(malformed);
}

export function detectSourceFileLeaks(
  content: string,
  sourcePaths: string[],
): SourceFileLeakReport {
  const lowerContent = content.toLowerCase();
  const exactPaths = sourcePaths
    .filter((path) => lowerContent.includes(path.toLowerCase()))
    .sort((left, right) => left.length - right.length);

  const genericPaths = dedupeStrings(content.match(GENERIC_TEX_PATH_REGEX) ?? []);
  const malformedCitationTokens = findMalformedCitationTokens(content).filter(
    (token) => token.includes(".tex") || token.includes("/"),
  );

  return {
    hasLeaks:
      exactPaths.length > 0 ||
      genericPaths.length > 0 ||
      malformedCitationTokens.length > 0,
    exactPaths,
    genericPaths,
    malformedCitationTokens,
  };
}

function isUnsafeFragment(fragment: string, sourcePaths: string[]): boolean {
  if (!fragment.trim()) return false;
  const leaks = detectSourceFileLeaks(fragment, sourcePaths);
  return leaks.hasLeaks;
}

export function stripUnsafeContent(content: string, sourcePaths: string[]): string {
  const cleanedLines = content
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith("#")) return line;
      if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
        return isUnsafeFragment(line, sourcePaths) ? "" : line;
      }

      const safeSentences = line
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => !isUnsafeFragment(sentence, sourcePaths));
      return safeSentences.join(" ").trim();
    })
    .filter((line, index, arr) => {
      if (line.trim()) return true;
      return index > 0 && arr[index - 1]?.trim() !== "";
    });

  return cleanedLines.join("\n").trim();
}
