import fs from "fs/promises";
import path from "path";
import { CACHE_DIR, sanitizeArxivId, paperDir } from "./constants";
import { fetchArxivMetadata, downloadPdf, downloadAndExtractSource } from "./arxiv";
import type { PaperMetadata } from "@/types";

export async function listPapers(): Promise<PaperMetadata[]> {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
    const dirs = await fs.readdir(CACHE_DIR, { withFileTypes: true });
    const papers: PaperMetadata[] = [];

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;
      try {
        const metaPath = path.join(CACHE_DIR, dir.name, "metadata.json");
        const raw = await fs.readFile(metaPath, "utf-8");
        papers.push(JSON.parse(raw));
      } catch {
        // Skip invalid directories
      }
    }

    // Sort by addedAt descending
    papers.sort(
      (a, b) =>
        new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
    );
    return papers;
  } catch {
    return [];
  }
}

export async function getPaper(
  sanitizedId: string
): Promise<PaperMetadata | null> {
  try {
    const metaPath = path.join(paperDir(sanitizedId), "metadata.json");
    const raw = await fs.readFile(metaPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function paperExists(sanitizedId: string): Promise<boolean> {
  try {
    await fs.access(path.join(paperDir(sanitizedId), "metadata.json"));
    return true;
  } catch {
    return false;
  }
}

export async function createPaper(arxivId: string): Promise<PaperMetadata> {
  const sanitized = sanitizeArxivId(arxivId);
  const dir = paperDir(sanitized);

  if (await paperExists(sanitized)) {
    const existing = await getPaper(sanitized);
    if (existing) return existing;
  }

  await fs.mkdir(dir, { recursive: true });

  // Fetch metadata
  const metadata = await fetchArxivMetadata(arxivId);

  // Save metadata
  await fs.writeFile(
    path.join(dir, "metadata.json"),
    JSON.stringify(metadata, null, 2)
  );

  // Download PDF and source in parallel
  await Promise.all([
    downloadPdf(arxivId, dir),
    downloadAndExtractSource(arxivId, dir),
  ]);

  // Create notes directory
  await fs.mkdir(path.join(dir, "notes"), { recursive: true });

  return metadata;
}

export async function deletePaper(sanitizedId: string): Promise<void> {
  const dir = paperDir(sanitizedId);
  await fs.rm(dir, { recursive: true, force: true });
}
