import path from "path";

export const CACHE_BASE_DIR = path.join(process.cwd(), ".cache");
export const CACHE_DIR = path.join(CACHE_BASE_DIR, "papers");

export const ARXIV_API_URL = "https://export.arxiv.org/api/query";
export const ARXIV_PDF_URL = "https://arxiv.org/pdf";
export const ARXIV_EPRINT_URL = "https://arxiv.org/e-print";

export const ARXIV_ID_REGEX = /^(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[A-Z]{2})?\/\d{7}(?:v\d+)?)$/;

export const ARXIV_URL_REGEX = /(?:arxiv\.org\/(?:abs|pdf|e-print)\/)(.+?)(?:\.pdf)?$/;

export function sanitizeArxivId(id: string): string {
  return id.replace(/\//g, "_");
}

export function unsanitizeArxivId(sanitized: string): string {
  // Old-style IDs like hep-th_0601001 -> hep-th/0601001
  return sanitized.replace(/^([a-z-]+(?:\.[A-Z]{2})?)_(\d{7})/, "$1/$2");
}

export function extractArxivId(input: string): string | null {
  const trimmed = input.trim();

  // Try bare ID first
  if (ARXIV_ID_REGEX.test(trimmed)) {
    return trimmed;
  }

  // Try extracting from URL
  const match = trimmed.match(ARXIV_URL_REGEX);
  if (match) {
    return match[1];
  }

  return null;
}

export function paperDir(sanitizedId: string): string {
  return path.join(CACHE_DIR, sanitizedId);
}
