"use client";

const MIN_SELECTION_CHARS = 4;
const ANNOTATION_CONTEXT_CHARS = 96;

interface BoundedChunk {
  start: number;
  end: number;
}

function hasBounds<T extends { start?: number; end?: number }>(
  chunk: T
): chunk is T & BoundedChunk {
  return chunk.start !== undefined && chunk.end !== undefined;
}

export interface PageTextRange {
  start: number;
  end: number;
}

export interface PageTextModel {
  spans: HTMLSpanElement[];
  text: string;
  normalizedText: string;
  ranges: PageTextRange[];
}

export interface AnnotationChunkCandidate {
  refId: string;
  normText: string;
  start?: number;
  end?: number;
}

export interface ResolvedSelectionAnchor {
  exact: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
  chunkRefId?: string;
}

export function cleanPdfText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function normalizePdfText(text: string): string {
  return cleanPdfText(text).toLowerCase();
}

export function getPageElementFromNode(node: Node | null): HTMLElement | null {
  if (!node) return null;

  const element = node instanceof Element ? node : node.parentElement;
  return element?.closest("[data-pn]") ?? null;
}

export function buildPageTextModel(pageElement: HTMLElement): PageTextModel | null {
  const textLayer = pageElement.querySelector(".react-pdf__Page__textContent");
  if (!textLayer) return null;

  const spans = Array.from(textLayer.querySelectorAll("span")).filter(
    (span): span is HTMLSpanElement =>
      span instanceof HTMLSpanElement && cleanPdfText(span.textContent ?? "").length > 0
  );

  if (spans.length === 0) return null;

  let text = "";
  let normalizedText = "";
  let cursor = 0;
  const ranges: PageTextRange[] = [];

  for (const span of spans) {
    const spanText = cleanPdfText(span.textContent ?? "");
    if (!spanText) continue;

    if (text) {
      text += " ";
      normalizedText += " ";
      cursor += 1;
    }

    const start = cursor;
    text += spanText;
    normalizedText += spanText.toLowerCase();
    cursor += spanText.length;
    ranges.push({ start, end: cursor });
  }

  if (ranges.length === 0 || !normalizedText) return null;

  return {
    spans,
    text,
    normalizedText,
    ranges,
  };
}

export function resolveChunkRefId(
  pageChunks: AnnotationChunkCandidate[] | undefined,
  selectionNorm: string,
  start?: number,
  end?: number
): string | undefined {
  if (!pageChunks?.length) return undefined;

  if (start !== undefined && end !== undefined) {
    const containing = pageChunks
      .filter(hasBounds)
      .filter(
        (chunk) =>
          chunk.start <= start &&
          chunk.end >= end
      )
      .sort((a, b) => (a.end - a.start) - (b.end - b.start));

    if (containing[0]) return containing[0].refId;

    const overlapping = pageChunks
      .filter(hasBounds)
      .filter(
        (chunk) =>
          chunk.end > start &&
          chunk.start < end
      )
      .sort((a, b) => (b.end - b.start) - (a.end - a.start));

    if (overlapping[0]) return overlapping[0].refId;
  }

  return pageChunks.find((chunk) => {
    const chunkText = chunk.normText.trim();
    return chunkText.includes(selectionNorm) || selectionNorm.includes(chunkText);
  })?.refId;
}

function resolveTextRange(
  model: PageTextModel,
  selectionNorm: string,
  selectedSpanIndexes: number[]
): { start?: number; end?: number } {
  if (!selectionNorm) return {};

  const firstSelectedIndex = selectedSpanIndexes[0] ?? 0;
  const approxStart = model.ranges[firstSelectedIndex]?.start ?? 0;
  const boundedStart = Math.max(0, approxStart - 48);

  let start = model.normalizedText.indexOf(selectionNorm, boundedStart);
  if (start < 0) {
    start = model.normalizedText.indexOf(selectionNorm);
  }

  if (start < 0) return {};

  return {
    start,
    end: start + selectionNorm.length,
  };
}

export function resolveSelectionAnchor(args: {
  pageElement: HTMLElement;
  range: Range;
  exactText: string;
  pageChunks?: AnnotationChunkCandidate[];
}): ResolvedSelectionAnchor | null {
  const { pageElement, range, exactText, pageChunks } = args;
  const model = buildPageTextModel(pageElement);
  const exact = cleanPdfText(exactText);
  if (!model || exact.length < MIN_SELECTION_CHARS) return null;

  const selectedSpanIndexes = model.spans
    .map((span, index) => (range.intersectsNode(span) ? index : -1))
    .filter((index) => index >= 0);

  if (selectedSpanIndexes.length === 0) return null;

  const selectionNorm = normalizePdfText(exact);
  const { start, end } = resolveTextRange(model, selectionNorm, selectedSpanIndexes);

  const prefix =
    start !== undefined
      ? model.text.slice(Math.max(0, start - ANNOTATION_CONTEXT_CHARS), start).trim()
      : undefined;
  const suffix =
    end !== undefined
      ? model.text
          .slice(end, Math.min(model.text.length, end + ANNOTATION_CONTEXT_CHARS))
          .trim()
      : undefined;

  return {
    exact,
    prefix: prefix || undefined,
    suffix: suffix || undefined,
    start,
    end,
    chunkRefId: resolveChunkRefId(pageChunks, selectionNorm, start, end),
  };
}

export function resolveAnnotationSpanIndexes(
  model: PageTextModel,
  annotation: {
    exact: string;
    start?: number;
    end?: number;
  }
): number[] {
  let resolvedStart = annotation.start;
  let resolvedEnd = annotation.end;

  if (resolvedStart === undefined || resolvedEnd === undefined) {
    const exactNorm = normalizePdfText(annotation.exact);
    if (!exactNorm) return [];

    const idx = model.normalizedText.indexOf(exactNorm);
    if (idx < 0) return [];

    resolvedStart = idx;
    resolvedEnd = idx + exactNorm.length;
  }

  const start = resolvedStart;
  const end = resolvedEnd;

  return model.ranges
    .map((range, index) => (range.end > start && range.start < end ? index : -1))
    .filter((index) => index >= 0);
}
