import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import {
  parseCitationTokens,
  type CitationToken,
} from "./citations";

export interface CitationPaperSource {
  paperId: Id<"papers">;
  activeIndexVersion?: number;
}

export interface ResolvedCitationEntry {
  paperId: Id<"papers">;
  indexVersion: number;
  refId: string;
  occurrence: number;
}

export interface CitationResolutionResult {
  citations: CitationToken[];
  uniqueRefIds: string[];
  entries: ResolvedCitationEntry[];
  invalidRefIds: string[];
  ambiguousRefIds: string[];
  missingRequiredCitations: boolean;
  isValid: boolean;
}

interface CitationMatch {
  paperId: Id<"papers">;
  indexVersion: number;
}

interface CitationValidationOptions {
  requireAtLeastOneCitation?: boolean;
}

export async function validateCitationsForPapers(
  convex: ConvexHttpClient,
  papers: CitationPaperSource[],
  content: string,
  options: CitationValidationOptions = {}
): Promise<CitationResolutionResult> {
  const citations = parseCitationTokens(content);
  const uniqueRefIds = [...new Set(citations.map((citation) => citation.refId))];
  const missingRequiredCitations =
    Boolean(options.requireAtLeastOneCitation) &&
    content.trim().length > 0 &&
    citations.length === 0;

  if (citations.length === 0) {
    return {
      citations,
      uniqueRefIds,
      entries: [],
      invalidRefIds: [],
      ambiguousRefIds: [],
      missingRequiredCitations,
      isValid: !missingRequiredCitations,
    };
  }

  const resolutionMap = new Map<string, CitationMatch[]>();

  for (const paper of papers) {
    if (!paper.activeIndexVersion) continue;

    const chunks = await convex.query(api.paperChunks.getByRefIds, {
      paperId: paper.paperId,
      indexVersion: paper.activeIndexVersion,
      refIds: uniqueRefIds,
    });

    for (const chunk of chunks) {
      const matches = resolutionMap.get(chunk.refId) ?? [];
      matches.push({
        paperId: paper.paperId,
        indexVersion: paper.activeIndexVersion,
      });
      resolutionMap.set(chunk.refId, matches);
    }
  }

  const entries: ResolvedCitationEntry[] = [];
  const invalidRefIds = new Set<string>();
  const ambiguousRefIds = new Set<string>();

  for (const citation of citations) {
    const matches = resolutionMap.get(citation.refId) ?? [];

    if (matches.length === 0) {
      invalidRefIds.add(citation.refId);
      continue;
    }

    if (matches.length > 1) {
      ambiguousRefIds.add(citation.refId);
      continue;
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
    citations,
    uniqueRefIds,
    entries,
    invalidRefIds: [...invalidRefIds],
    ambiguousRefIds: [...ambiguousRefIds],
    missingRequiredCitations: false,
    isValid: invalidRefIds.size === 0 && ambiguousRefIds.size === 0,
  };
}

export function buildCitationValidationError(
  result: CitationResolutionResult
): string {
  if (result.ambiguousRefIds.length > 0) {
    return `Ambiguous citation refs: ${result.ambiguousRefIds.join(", ")}`;
  }

  if (result.invalidRefIds.length > 0) {
    return `Invalid citation refs: ${result.invalidRefIds.join(", ")}`;
  }

  if (result.missingRequiredCitations) {
    return "Assistant response did not include any citation tokens";
  }

  return "Citation validation failed";
}
