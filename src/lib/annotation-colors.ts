export interface HighlightColor {
  id: string;
  label: string;
  bg: string;
  border: string;
  dot: string;
}

export const HIGHLIGHT_COLORS: readonly HighlightColor[] = [
  { id: "amber", label: "Key Finding", bg: "rgba(255,204,51,0.25)", border: "rgba(255,204,51,0.45)", dot: "rgba(255,204,51,0.8)" },
  { id: "rose", label: "Important", bg: "rgba(255,100,130,0.25)", border: "rgba(255,100,130,0.45)", dot: "rgba(255,100,130,0.8)" },
  { id: "violet", label: "Methodology", bg: "rgba(167,139,250,0.25)", border: "rgba(167,139,250,0.45)", dot: "rgba(167,139,250,0.8)" },
  { id: "sky", label: "Question", bg: "rgba(0,160,220,0.25)", border: "rgba(0,160,220,0.45)", dot: "rgba(0,160,220,0.8)" },
  { id: "emerald", label: "Evidence", bg: "rgba(52,211,153,0.25)", border: "rgba(52,211,153,0.45)", dot: "rgba(52,211,153,0.8)" },
  { id: "slate", label: "General", bg: "rgba(148,163,184,0.25)", border: "rgba(148,163,184,0.45)", dot: "rgba(148,163,184,0.8)" },
] as const;

const COLOR_MAP = new Map(HIGHLIGHT_COLORS.map((c) => [c.id, c]));

export const DEFAULT_HIGHLIGHT_COLOR = "amber";
export const DEFAULT_NOTE_COLOR = "sky";

export function getColorById(id: string | undefined): HighlightColor {
  return COLOR_MAP.get(id ?? "") ?? HIGHLIGHT_COLORS[0]!;
}

export function getColorLabel(id: string | undefined): string {
  return getColorById(id).label;
}

/**
 * Returns the CSS class name to apply to an annotation span in the PDF.
 * Uses per-color classes when a color is set, falling back to kind-based classes.
 */
export function getAnnotationCssClass(
  color: string | undefined,
  kind: "highlight" | "note",
): string {
  const colorId = color ?? (kind === "note" ? DEFAULT_NOTE_COLOR : DEFAULT_HIGHLIGHT_COLOR);
  if (COLOR_MAP.has(colorId)) {
    return `pdf-annotation-color-${colorId}`;
  }
  return kind === "note" ? "pdf-annotation-note" : "pdf-annotation-highlight";
}
