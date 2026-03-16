import type { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export const ANNOTATION_TOKEN_REGEX = /\[\[annot:([^\]]+)\]\]/g;

export interface AnnotationToken {
  annotationId: string;
  token: string;
  start: number;
  end: number;
  occurrence: number;
}

export interface AnnotationValidationResult {
  annotations: AnnotationToken[];
  uniqueAnnotationIds: string[];
  invalidAnnotationIds: string[];
  isValid: boolean;
}

export interface AnnotationPromptEntry {
  annotationId: string;
  page: number;
  kind: "highlight" | "note";
  comment?: string;
  exact: string;
}

export function formatAnnotationToken(annotationId: string): string {
  return `[[annot:${annotationId}]]`;
}

export function parseAnnotationTokens(content: string): AnnotationToken[] {
  const annotations: AnnotationToken[] = [];
  let match: RegExpExecArray | null;
  let occurrence = 0;

  ANNOTATION_TOKEN_REGEX.lastIndex = 0;
  while ((match = ANNOTATION_TOKEN_REGEX.exec(content)) !== null) {
    const token = match[0];
    const annotationId = match[1]?.trim();
    if (!annotationId) continue;

    annotations.push({
      annotationId,
      token,
      start: match.index,
      end: match.index + token.length,
      occurrence: occurrence++,
    });
  }

  ANNOTATION_TOKEN_REGEX.lastIndex = 0;
  return annotations;
}

export async function validateAnnotationsForPapers(
  convex: ConvexHttpClient,
  paperIds: Id<"papers">[],
  content: string,
): Promise<AnnotationValidationResult> {
  const annotations = parseAnnotationTokens(content);
  const uniqueAnnotationIds = [
    ...new Set(annotations.map((annotation) => annotation.annotationId)),
  ];

  if (uniqueAnnotationIds.length === 0) {
    return {
      annotations,
      uniqueAnnotationIds,
      invalidAnnotationIds: [],
      isValid: true,
    };
  }

  const matches = await convex.query(api.annotations.getByIdsForPapers, {
    paperIds,
    annotationIds: uniqueAnnotationIds,
  });
  const validIds = new Set(matches.map((annotation) => annotation.annotationId));

  return {
    annotations,
    uniqueAnnotationIds,
    invalidAnnotationIds: uniqueAnnotationIds.filter((id) => !validIds.has(id)),
    isValid: uniqueAnnotationIds.every((id) => validIds.has(id)),
  };
}

export function buildAnnotationValidationError(
  result: AnnotationValidationResult,
): string {
  if (result.invalidAnnotationIds.length > 0) {
    return `Invalid annotation refs: ${result.invalidAnnotationIds.join(", ")}`;
  }

  return "Annotation validation failed";
}

export function buildAnnotationPromptBlock(
  annotations: AnnotationPromptEntry[],
): string {
  if (annotations.length === 0) {
    return "Saved annotations: none.";
  }

  const entries = annotations
    .slice(0, 24)
    .map((annotation) => {
      const excerpt =
        annotation.exact.length > 220
          ? `${annotation.exact.slice(0, 220)}…`
          : annotation.exact;
      const comment = annotation.comment?.trim();
      return `- ${formatAnnotationToken(annotation.annotationId)} ${annotation.kind} on page ${annotation.page}
  Excerpt: "${excerpt}"
  ${comment ? `Comment: "${comment}"` : "Comment: none"}`;
    })
    .join("\n");

  return `Saved user annotations:
${entries}`;
}
