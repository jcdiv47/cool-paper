export const ANNOTATION_TOKEN_REGEX = /\[\[annot:([^\]]+)\]\]/g;

export interface AnnotationToken {
  annotationId: string;
  token: string;
  start: number;
  end: number;
  occurrence: number;
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
