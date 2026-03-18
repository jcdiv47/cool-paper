/**
 * Citation and annotation validation for Convex actions.
 * Operates on pre-fetched data rather than using ConvexHttpClient.
 */

// --- Citation parsing ---

const CITATION_TOKEN_REGEX = /\[\[cite:([a-zA-Z0-9_-]+)\]\]/g;

export interface CitationToken {
  refId: string;
  occurrence: number;
}

export function parseCitationTokens(content: string): CitationToken[] {
  const citations: CitationToken[] = [];
  let match: RegExpExecArray | null;
  let occurrence = 0;

  CITATION_TOKEN_REGEX.lastIndex = 0;
  while ((match = CITATION_TOKEN_REGEX.exec(content)) !== null) {
    const refId = match[1];
    if (!refId) continue;
    citations.push({ refId, occurrence: occurrence++ });
  }
  CITATION_TOKEN_REGEX.lastIndex = 0;
  return citations;
}

export function listUniqueCitationRefIds(content: string): string[] {
  return [...new Set(parseCitationTokens(content).map((c) => c.refId))];
}

// --- Annotation parsing ---

const ANNOTATION_TOKEN_REGEX = /\[\[annot:([^\]]+)\]\]/g;

export interface AnnotationToken {
  annotationId: string;
  occurrence: number;
}

export function parseAnnotationTokens(content: string): AnnotationToken[] {
  const annotations: AnnotationToken[] = [];
  let match: RegExpExecArray | null;
  let occurrence = 0;

  ANNOTATION_TOKEN_REGEX.lastIndex = 0;
  while ((match = ANNOTATION_TOKEN_REGEX.exec(content)) !== null) {
    const annotationId = match[1]?.trim();
    if (!annotationId) continue;
    annotations.push({ annotationId, occurrence: occurrence++ });
  }
  ANNOTATION_TOKEN_REGEX.lastIndex = 0;
  return annotations;
}

// --- Validation ---

export interface ResolvedCitationEntry {
  paperId: string;
  indexVersion: number;
  refId: string;
  occurrence: number;
}

export interface CitationResolutionResult {
  entries: ResolvedCitationEntry[];
  invalidRefIds: string[];
  ambiguousRefIds: string[];
  missingRequiredCitations: boolean;
}

/**
 * Validate citation tokens against pre-fetched chunk data.
 * @param chunks Array of { refId, paperId, indexVersion } from paper_chunks query
 * @param content The text content containing [[cite:...]] tokens
 * @param requireAtLeastOne Whether to fail if no citations found
 */
export function validateCitations(
  chunks: { refId: string; paperId: string; indexVersion: number }[],
  content: string,
  requireAtLeastOne = false
): CitationResolutionResult {
  const citations = parseCitationTokens(content);

  if (citations.length === 0) {
    return {
      entries: [],
      invalidRefIds: [],
      ambiguousRefIds: [],
      missingRequiredCitations:
        requireAtLeastOne && content.trim().length > 0,
    };
  }

  // Build lookup: refId → { paperId, indexVersion }[]
  const refIdMap = new Map<
    string,
    { paperId: string; indexVersion: number }[]
  >();
  for (const chunk of chunks) {
    const matches = refIdMap.get(chunk.refId) ?? [];
    matches.push({ paperId: chunk.paperId, indexVersion: chunk.indexVersion });
    refIdMap.set(chunk.refId, matches);
  }

  const entries: ResolvedCitationEntry[] = [];
  const invalidRefIds = new Set<string>();
  const ambiguousRefIds = new Set<string>();

  for (const citation of citations) {
    const matches = refIdMap.get(citation.refId) ?? [];
    if (matches.length === 0) {
      invalidRefIds.add(citation.refId);
      continue;
    }
    if (matches.length > 1) {
      ambiguousRefIds.add(citation.refId);
      // Still use the first match
    }
    const match = matches[0]!;
    entries.push({
      paperId: match.paperId,
      indexVersion: match.indexVersion,
      refId: citation.refId,
      occurrence: citation.occurrence,
    });
  }

  return {
    entries,
    invalidRefIds: [...invalidRefIds],
    ambiguousRefIds: [...ambiguousRefIds],
    missingRequiredCitations: false,
  };
}

/**
 * Validate annotation tokens against pre-fetched annotation data.
 */
export function validateAnnotations(
  validAnnotationIds: Set<string>,
  content: string
): { invalidAnnotationIds: string[] } {
  const tokens = parseAnnotationTokens(content);
  const uniqueIds = [...new Set(tokens.map((t) => t.annotationId))];
  return {
    invalidAnnotationIds: uniqueIds.filter((id) => !validAnnotationIds.has(id)),
  };
}
