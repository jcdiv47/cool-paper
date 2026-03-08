import { XMLParser } from "fast-xml-parser";
import fs from "fs/promises";
import path from "path";
import { ARXIV_API_URL, ARXIV_PDF_URL, ARXIV_EPRINT_URL } from "./constants";
import type { PaperMetadata } from "@/types";
import { execSync } from "child_process";

export async function fetchArxivMetadata(
  arxivId: string
): Promise<PaperMetadata> {
  const url = `${ARXIV_API_URL}?id_list=${arxivId}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Arxiv API error: ${res.status}`);
  }

  const xml = await res.text();
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,
  });
  const parsed = parser.parse(xml);

  const entry = parsed.feed?.entry;
  if (!entry || entry.id === undefined) {
    throw new Error(`Paper not found: ${arxivId}`);
  }

  // Handle authors - can be single object or array
  const rawAuthors = Array.isArray(entry.author)
    ? entry.author
    : [entry.author];
  const authors = rawAuthors.map(
    (a: { name: string }) => a.name
  );

  // Handle categories
  const rawCategories = Array.isArray(entry.category)
    ? entry.category
    : [entry.category];
  const categories = rawCategories.map(
    (c: { "@_term": string }) => c["@_term"]
  );

  // Clean title - remove newlines
  const title = String(entry.title).replace(/\s+/g, " ").trim();
  const abstract = String(entry.summary).replace(/\s+/g, " ").trim();

  return {
    arxivId,
    title,
    authors,
    abstract,
    published: entry.published,
    categories,
    addedAt: new Date().toISOString(),
  };
}

export async function downloadPdf(
  arxivId: string,
  destDir: string
): Promise<string> {
  const url = `${ARXIV_PDF_URL}/${arxivId}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to download PDF: ${res.status}`);
  }

  const pdfPath = path.join(destDir, "paper.pdf");
  const buffer = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(pdfPath, buffer);
  return pdfPath;
}

export async function downloadAndExtractSource(
  arxivId: string,
  destDir: string
): Promise<string> {
  const url = `${ARXIV_EPRINT_URL}/${arxivId}`;
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    throw new Error(`Failed to download source: ${res.status}`);
  }

  const sourceDir = path.join(destDir, "source");
  await fs.mkdir(sourceDir, { recursive: true });

  const buffer = Buffer.from(await res.arrayBuffer());
  const tmpFile = path.join(destDir, "eprint_download");
  await fs.writeFile(tmpFile, buffer);

  try {
    // Try tar.gz first (most common)
    execSync(`tar xzf "${tmpFile}" -C "${sourceDir}" 2>/dev/null`, {
      stdio: "pipe",
    });
  } catch {
    try {
      // Try plain gzip (single .tex file)
      execSync(
        `cd "${sourceDir}" && gunzip -c "${tmpFile}" > main.tex 2>/dev/null`,
        { stdio: "pipe" }
      );
    } catch {
      // Plain text - just copy as main.tex
      await fs.copyFile(tmpFile, path.join(sourceDir, "main.tex"));
    }
  }

  // Clean up temp file
  await fs.unlink(tmpFile).catch(() => {});

  return sourceDir;
}
