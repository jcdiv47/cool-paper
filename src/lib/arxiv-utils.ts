/** Client-safe arxiv ID utilities (no Node.js imports) */

export const ARXIV_ID_REGEX = /^(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/;

export const ARXIV_URL_REGEX = /(?:arxiv\.org\/(?:abs|pdf|e-print)\/)(.+?)(?:\.pdf)?$/;

export function sanitizeArxivId(id: string): string {
  return id.replace(/\//g, "_");
}

export function unsanitizeArxivId(sanitized: string): string {
  return sanitized.replace(/^([a-z-]+(?:\.[A-Z]{2})?)_(\d{7})/, "$1/$2");
}

export function extractArxivId(input: string): string | null {
  const trimmed = input.trim();
  if (ARXIV_ID_REGEX.test(trimmed)) return trimmed;
  const match = trimmed.match(ARXIV_URL_REGEX);
  if (match) return match[1]!;
  return null;
}
