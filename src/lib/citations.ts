export const CITATION_TOKEN_REGEX = /\[\[cite:([a-zA-Z0-9_-]+)\]\]/g;

export interface CitationToken {
  refId: string;
  token: string;
  start: number;
  end: number;
  occurrence: number;
}

export interface CitationValidationSummary {
  citations: CitationToken[];
  uniqueRefIds: string[];
  invalidRefIds: string[];
  isValid: boolean;
}

export function formatCitationToken(refId: string): string {
  return `[[cite:${refId}]]`;
}

export function parseCitationTokens(content: string): CitationToken[] {
  const citations: CitationToken[] = [];
  let match: RegExpExecArray | null;
  let occurrence = 0;

  CITATION_TOKEN_REGEX.lastIndex = 0;
  while ((match = CITATION_TOKEN_REGEX.exec(content)) !== null) {
    const token = match[0];
    const refId = match[1];
    if (!refId) continue;

    citations.push({
      refId,
      token,
      start: match.index,
      end: match.index + token.length,
      occurrence: occurrence++,
    });
  }

  CITATION_TOKEN_REGEX.lastIndex = 0;
  return citations;
}

export function listCitationRefIds(content: string): string[] {
  return parseCitationTokens(content).map((citation) => citation.refId);
}

export function listUniqueCitationRefIds(content: string): string[] {
  return [...new Set(listCitationRefIds(content))];
}

export function stripCitationTokens(content: string): string {
  return content.replace(CITATION_TOKEN_REGEX, "").trim();
}

export function validateCitationRefIds(
  content: string,
  validRefIds: Iterable<string>
): CitationValidationSummary {
  const citations = parseCitationTokens(content);
  const uniqueRefIds = [...new Set(citations.map((citation) => citation.refId))];
  const validSet = new Set(validRefIds);
  const invalidRefIds = uniqueRefIds.filter((refId) => !validSet.has(refId));

  return {
    citations,
    uniqueRefIds,
    invalidRefIds,
    isValid: invalidRefIds.length === 0,
  };
}
