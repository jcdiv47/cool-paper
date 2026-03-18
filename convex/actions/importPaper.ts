"use node";

import { stepCountIs } from "@convex-dev/agent";
import { XMLParser } from "fast-xml-parser";
import { v } from "convex/values";
import { action, internalAction } from "../_generated/server";
import { api, internal } from "../_generated/api";
import {
  buildEvidenceChunks,
  EVIDENCE_EXTRACTOR_VERSION,
  EVIDENCE_INDEX_VERSION,
} from "../lib/evidence";
import { paperSummaryAgent, resolveModel } from "../agents/paper";
import { workflow } from "../workflow";

const ARXIV_API_URL = "https://export.arxiv.org/api/query";
const ARXIV_PDF_URL = "https://arxiv.org/pdf";
const ARXIV_EPRINT_URL = "https://arxiv.org/e-print";

const TEXT_SOURCE_EXTENSIONS = new Set([
  ".tex",
  ".bib",
  ".sty",
  ".cls",
  ".txt",
  ".bst",
  ".tikz",
  ".dtx",
  ".ins",
]);

function sanitizeArxivId(id: string) {
  return id.replace(/\//g, "_");
}

function buildSummaryPrelude(paper: {
  title: string;
  authors: string[];
  abstract: string;
}) {
  return [
    `# ${paper.title}`,
    "",
    `**Authors:** ${paper.authors.join(", ")}`,
    "",
    "## Abstract",
    "",
    paper.abstract,
  ].join("\n");
}

function buildGuidedSummaryPrompt(paper: {
  _id: string;
  title: string;
  authors: string[];
  abstract: string;
}) {
  return `You are preparing a structured reading guide for an academic paper.

Pass paperId="${paper._id}" to every tool call.

Paper title: ${paper.title}
Authors: ${paper.authors.join(", ")}
Abstract: ${paper.abstract}

Read the TeX and bibliography source files first. Use PDF evidence only if the source files are incomplete.

Return markdown only. Do not repeat the paper title, authors, or abstract because they are already provided above this section.
Start with the heading "## Reading Guide".
Answer the following questions as sections in this exact order:

### Q1. What problems does the paper aim to solve?
### Q2. What related researches were mentioned?
### Q3. How did the paper propose to solve the problems?
### Q4. What experiments were conducted?
### Q5. What are some of the most promising directions for next step?
### Q6. A quick summary of the paper.

Keep the writing concise, factual, and easy to scan.
Use standard markdown.
Render formulas with $...$ and $$...$$ when helpful.
Do not emit citation tokens or annotation tokens.`;
}

async function fetchArxivMetadata(arxivId: string) {
  const url = `${ARXIV_API_URL}?id_list=${arxivId}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`arXiv API error: ${res.status}`);

  const xml = await res.text();
  const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
  const parsed = parser.parse(xml);
  const entry = parsed.feed?.entry;
  if (!entry || entry.id === undefined) {
    throw new Error(`Paper not found: ${arxivId}`);
  }

  const rawAuthors = Array.isArray(entry.author) ? entry.author : [entry.author];
  const authors = rawAuthors.map((author: { name: string }) => author.name);
  const rawCategories = Array.isArray(entry.category)
    ? entry.category
    : [entry.category];
  const categories = rawCategories.map(
    (category: { "@_term": string }) => category["@_term"],
  );
  const title = String(entry.title).replace(/\s+/g, " ").trim();
  const abstract = String(entry.summary).replace(/\s+/g, " ").trim();

  return {
    arxivId,
    title,
    authors,
    abstract,
    published: entry.published,
    categories,
  };
}

async function extractPdfPageTexts(pdfBuffer: ArrayBuffer): Promise<string[]> {
  const { extractText } = await import("unpdf");
  const result = await extractText(new Uint8Array(pdfBuffer), { mergePages: false });
  return result.text;
}

function parseTar(buffer: Uint8Array): { name: string; content: Uint8Array }[] {
  const files: { name: string; content: Uint8Array }[] = [];
  let offset = 0;

  while (offset + 512 <= buffer.length) {
    const header = buffer.slice(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;

    let name = "";
    for (let i = 0; i < 100 && header[i] !== 0; i++) {
      name += String.fromCharCode(header[i]!);
    }

    const prefix = new TextDecoder()
      .decode(header.slice(345, 500))
      .replace(/\0/g, "");
    if (prefix) {
      name = `${prefix}/${name}`;
    }

    const size = parseInt(
      new TextDecoder().decode(header.slice(124, 136)).replace(/\0/g, "").trim(),
      8,
    ) || 0;
    const typeFlag = header[156];

    offset += 512;

    if (size > 0) {
      const content = buffer.slice(offset, offset + size);
      if ((typeFlag === 0 || typeFlag === 48 || typeFlag === undefined) && name && !name.endsWith("/")) {
        files.push({ name: name.replace(/^\.\//, ""), content });
      }
      offset += Math.ceil(size / 512) * 512;
    }
  }

  return files;
}

interface SourceFile {
  relativePath: string;
  content: string;
  fileType: string;
}

function getFileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot) : "";
}

async function extractSourceFiles(buffer: ArrayBuffer): Promise<SourceFile[]> {
  const bytes = new Uint8Array(buffer);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  const files: SourceFile[] = [];

  let tarBytes: Uint8Array | null = null;

  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    const pako = await import("pako");
    try {
      const decompressed = pako.inflate(bytes);
      if (
        decompressed.length > 262 &&
        new TextDecoder().decode(decompressed.slice(257, 262)) === "ustar"
      ) {
        tarBytes = decompressed;
      } else {
        const content = decoder.decode(decompressed);
        if (content.trim()) {
          files.push({
            relativePath: "main.tex",
            content,
            fileType: "tex",
          });
        }
        return files;
      }
    } catch {
      // Fall through to plain text parsing.
    }
  }

  if (!tarBytes && bytes.length > 262) {
    const magic = new TextDecoder().decode(bytes.slice(257, 262));
    if (magic === "ustar") {
      tarBytes = bytes;
    }
  }

  if (tarBytes) {
    const tarFiles = parseTar(tarBytes);
    for (const file of tarFiles) {
      const ext = getFileExtension(file.name);
      if (!TEXT_SOURCE_EXTENSIONS.has(ext)) continue;

      try {
        const content = decoder.decode(file.content);
        if (content.trim()) {
          files.push({
            relativePath: file.name,
            content,
            fileType: ext.replace(".", ""),
          });
        }
      } catch {
        // Skip invalid or binary files.
      }
    }
    return files;
  }

  const content = decoder.decode(bytes);
  if (content.trim() && (content.includes("\\begin{") || content.includes("\\documentclass"))) {
    files.push({
      relativePath: "main.tex",
      content,
      fileType: "tex",
    });
  }

  return files;
}

export const retryImport = action({
  args: {
    sanitizedId: v.string(),
  },
  handler: async (ctx, { sanitizedId }): Promise<{ status: string }> => {
    const paper = await ctx.runQuery(api.papers.get, { sanitizedId });
    if (!paper) {
      throw new Error("Paper not found");
    }
    if (!paper.importStatus?.startsWith("failed")) {
      throw new Error("Paper is not in failed state");
    }

    await ctx.runMutation(api.papers.updateImportStatus, {
      id: paper._id,
      importStatus: "queued",
    });

    await workflow.start(ctx, internal.workflows.importPaper.runImportPaper, {
      paperId: paper._id,
      arxivId: paper.arxivId,
      sanitizedId,
    });

    return { status: "queued" };
  },
});

export const importPaper = action({
  args: {
    arxivId: v.string(),
  },
  handler: async (ctx, { arxivId }): Promise<{ paperId: string; status: string }> => {
    const sanitizedId = sanitizeArxivId(arxivId);
    const existing = await ctx.runQuery(api.papers.get, { sanitizedId });
    if (existing) {
      return { paperId: existing._id, status: "already_exists" };
    }

    const metadata = await fetchArxivMetadata(arxivId);
    const paperId = await ctx.runMutation(api.papers.create, {
      arxivId: metadata.arxivId,
      sanitizedId,
      title: metadata.title,
      authors: metadata.authors,
      abstract: metadata.abstract,
      summary: buildSummaryPrelude(metadata),
      published: metadata.published,
      categories: metadata.categories,
      addedAt: new Date().toISOString(),
    });

    await ctx.runMutation(api.papers.updateImportStatus, {
      id: paperId,
      importStatus: "queued",
    });

    await workflow.start(ctx, internal.workflows.importPaper.runImportPaper, {
      paperId,
      arxivId,
      sanitizedId,
    });

    return { paperId, status: "queued" };
  },
});

export const ingestPaperAssets = internalAction({
  args: {
    paperId: v.id("papers"),
    arxivId: v.string(),
    sanitizedId: v.string(),
  },
  handler: async (ctx, { paperId, arxivId, sanitizedId }): Promise<void> => {
    await ctx.runMutation(api.papers.updateImportStatus, {
      id: paperId,
      importStatus: "downloading_pdf",
    });

    const pdfRes = await fetch(`${ARXIV_PDF_URL}/${arxivId}`, {
      redirect: "follow",
    });
    if (!pdfRes.ok) {
      throw new Error(`Failed to download PDF: ${pdfRes.status}`);
    }

    const pdfBuffer = await pdfRes.arrayBuffer();
    const pdfBlob = new Blob([pdfBuffer], { type: "application/pdf" });
    const pdfStorageId = await ctx.storage.store(pdfBlob);
    await ctx.runMutation(api.papers.updatePdfStorage, {
      id: paperId,
      pdfStorageId,
    });

    await ctx.runMutation(api.papers.updateImportStatus, {
      id: paperId,
      importStatus: "downloading_source",
    });

    try {
      const sourceRes = await fetch(`${ARXIV_EPRINT_URL}/${arxivId}`, {
        redirect: "follow",
      });
      if (sourceRes.ok) {
        const sourceBuffer = await sourceRes.arrayBuffer();
        const sourceFiles = await extractSourceFiles(sourceBuffer);
        if (sourceFiles.length > 0) {
          const firstBatch = sourceFiles.slice(0, 10);
          await ctx.runMutation(api.paperSourceFiles.replaceForPaper, {
            paperId,
            files: firstBatch.map((file) => ({
              relativePath: file.relativePath,
              content: file.content,
              fileType: file.fileType,
            })),
          });
          for (let i = 10; i < sourceFiles.length; i += 10) {
            const batch = sourceFiles.slice(i, i + 10);
            for (const file of batch) {
              await ctx.runMutation(api.paperSourceFiles.insert, {
                paperId,
                relativePath: file.relativePath,
                content: file.content,
                fileType: file.fileType,
              });
            }
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to download TeX source for ${arxivId}:`, error);
    }

    await ctx.runMutation(api.papers.updateImportStatus, {
      id: paperId,
      importStatus: "building_index",
    });

    const pageTexts = await extractPdfPageTexts(pdfBuffer);
    const chunks = await buildEvidenceChunks(sanitizedId, pageTexts);

    await ctx.runMutation(api.paperIndexes.create, {
      paperId,
      version: EVIDENCE_INDEX_VERSION,
      extractorVersion: EVIDENCE_EXTRACTOR_VERSION,
      createdAt: new Date().toISOString(),
    });

    for (let i = 0; i < chunks.length; i += 100) {
      const batch = chunks.slice(i, i + 100);
      if (i === 0) {
        await ctx.runMutation(api.paperChunks.replaceForIndex, {
          paperId,
          indexVersion: EVIDENCE_INDEX_VERSION,
          chunks: batch,
        });
      } else {
        await ctx.runMutation(api.paperChunks.appendForIndex, {
          paperId,
          indexVersion: EVIDENCE_INDEX_VERSION,
          chunks: batch,
        });
      }
    }
  },
});

export const generatePaperSummary = internalAction({
  args: {
    paperId: v.id("papers"),
  },
  handler: async (ctx, { paperId }): Promise<void> => {
    const paper = await ctx.runQuery(api.papers.getById, { id: paperId });
    if (!paper) {
      throw new Error("Paper not found");
    }

    await ctx.runMutation(api.papers.updateImportStatus, {
      id: paperId,
      importStatus: "generating_summary",
    });

    const { threadId } = await paperSummaryAgent.createThread(ctx, {});
    const systemPrompt = buildGuidedSummaryPrompt({
      _id: String(paper._id),
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
    });

    const languageModel = resolveModel();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const firstPassOptions: any = {
      system: systemPrompt,
      prompt:
        "Read the paper source carefully and return the markdown reading guide only.",
      model: languageModel,
      stopWhen: stepCountIs(16),
    };
    const firstPass = await paperSummaryAgent.generateText(
      ctx,
      { threadId },
      firstPassOptions,
    );

    let guide = firstPass.text?.trim();
    if (!guide) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const followUpOptions: any = {
        system: systemPrompt,
        prompt:
          "Using the context and tool results already gathered, write the markdown reading guide now. Do not call more tools.",
        model: languageModel,
        tools: {},
      };
      const followUp = await paperSummaryAgent.generateText(
        ctx,
        { threadId },
        followUpOptions,
      );
      guide = followUp.text?.trim();
    }

    if (!guide) {
      throw new Error("Summary generation returned empty content");
    }

    await ctx.runMutation(api.papers.updateSummary, {
      id: paperId,
      summary: `${buildSummaryPrelude(paper)}\n\n${guide}`,
    });
  },
});
