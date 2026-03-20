"use node";

import { stepCountIs } from "@convex-dev/agent";
import { XMLParser } from "fast-xml-parser";
import { v } from "convex/values";
import { action, internalAction, type ActionCtx } from "../_generated/server";
import { api, internal } from "../_generated/api";
import {
  buildEvidenceChunks,
  EVIDENCE_EXTRACTOR_VERSION,
  EVIDENCE_INDEX_VERSION,
} from "../lib/evidence";
import {
  extractOutlineFromPdf,
  extractTopLevelSectionTitles,
  mapSectionTitlesToPages,
} from "../lib/sectionOutline";
import {
  citationRules,
  draftOutputRules,
  draftWorkflow,
  groundingWorkflow,
  paperGroundingAgent,
  paperSummaryAgent,
  resolveModel,
  toolWorkflow,
} from "../agents/paper";
import { listUniqueCitationRefIds, validateCitations } from "../lib/citations";
import {
  detectSourceFileLeaks,
  parseDraftAnswer,
  stripUnsafeContent,
  type DraftAnswer,
  type DraftClaim,
} from "../lib/grounding";
import { parseThinkTags } from "../lib/modelConfig";
import type { Doc } from "../_generated/dataModel";
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

const SUMMARY_SECTIONS = [
  "Q1. What problems does the paper aim to solve?",
  "Q2. What related researches were mentioned?",
  "Q3. How did the paper propose to solve the problems?",
  "Q4. What experiments were conducted?",
  "Q5. What are some of the most promising directions for next step?",
  "Q6. A quick summary of the paper.",
] as const;

function cleanModelText(text?: string): string {
  if (!text) return "";
  return parseThinkTags(text).content.trim();
}

function buildSummaryDraftSchemaPrompt() {
  return `Return strict JSON matching this shape:
{
  "claims": [
    {
      "id": "claim_1",
      "section": "one of the required Q1-Q6 section labels",
      "paperId": "paper id",
      "text": "one atomic factual sentence",
      "groundingQueries": ["1 to 3 short PDF search queries"],
      "optional": false
    }
  ]
}

Use exactly these section labels:
${SUMMARY_SECTIONS.map((section) => `- ${section}`).join("\n")}`;
}

function buildSummaryDraftSystemPrompt(paper: {
  _id: string;
  title: string;
  authors: string[];
  abstract: string;
}) {
  return `You are preparing an internal structured reading-guide draft for an academic paper.

Pass paperId="${paper._id}" to every tool call.

Paper title: ${paper.title}
Authors: ${paper.authors.join(", ")}
Abstract: ${paper.abstract}

${toolWorkflow()}
${draftWorkflow()}
${draftOutputRules()}

${buildSummaryDraftSchemaPrompt()}

Rules:
- Read the TeX source files first and use them as the primary source of truth.
- Use PDF evidence tools when TeX is incomplete or when you need phrasing likely to appear in the PDF.
- Do not repeat the title, authors, or abstract.
- Do not emit markdown, citation tokens, or source file names.`;
}

function buildSummaryGroundingSystemPrompt(paper: {
  _id: string;
  title: string;
  authors: string[];
  abstract: string;
}) {
  return `You are preparing the final user-visible reading guide for an academic paper.

Pass paperId="${paper._id}" to every tool call.

Paper title: ${paper.title}
Authors: ${paper.authors.join(", ")}
Abstract: ${paper.abstract}

${groundingWorkflow()}
${citationRules()}

Output markdown only.
- Start with the heading "## Reading Guide".
- Use the following section headings in this exact order:
${SUMMARY_SECTIONS.map((section) => `  - ### ${section}`).join("\n")}
- Keep grounded factual sentences concise and cite them inline.
- If a section cannot be grounded to the PDF, keep the heading and write: "Unable to confidently ground details for this section from the PDF."
- Never mention TeX source files, source paths, or tool names.`;
}

function buildSummaryGroundingPrompt(draft: DraftAnswer) {
  return `Ground this structured reading-guide draft to the PDF:

\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Write the final cited markdown reading guide now.`;
}

function buildSummaryRepairPrompt(
  draft: DraftAnswer,
  invalidGuide: string,
  issues: string[],
) {
  return `The previous grounded reading guide was invalid.

Validation issues:
${issues.map((issue) => `- ${issue}`).join("\n")}

Invalid guide:

${invalidGuide}

Original draft:

\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Rewrite the final markdown reading guide so that grounded claims use valid PDF citations and no TeX file names appear.`;
}

function buildSummaryFallbackGuide() {
  return [
    "## Reading Guide",
    "",
    ...SUMMARY_SECTIONS.flatMap((section) => [
      `### ${section}`,
      "",
      "Unable to confidently ground details for this section from the PDF.",
      "",
    ]),
  ].join("\n").trim();
}

function fallbackSummaryDraft(rawText: string, paperId: string): DraftAnswer {
  const cleaned = cleanModelText(rawText).trim();
  const sentenceMatches = cleaned.match(/[^.!?]+[.!?]?/g) ?? [];
  const claims: DraftClaim[] = sentenceMatches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, SUMMARY_SECTIONS.length)
    .map((sentence, index) => ({
      id: `claim_${index + 1}`,
      section: SUMMARY_SECTIONS[Math.min(index, SUMMARY_SECTIONS.length - 1)],
      paperId,
      text: sentence,
      groundingQueries: [sentence.slice(0, 220)],
      optional: false,
    }));

  return { claims };
}

async function runSummaryDraftPass(
  ctx: ActionCtx,
  paper: Doc<"papers">,
  languageModel: ReturnType<typeof resolveModel>,
): Promise<DraftAnswer> {
  const { threadId } = await paperSummaryAgent.createThread(ctx, {});
  const systemPrompt = buildSummaryDraftSystemPrompt({
    _id: String(paper._id),
    title: paper.title,
    authors: paper.authors,
    abstract: paper.abstract,
  });

  const firstPass = await paperSummaryAgent.generateText(
    ctx,
    { threadId },
    {
      system: systemPrompt,
      prompt: "Read the paper source carefully and return the JSON reading-guide draft only.",
      model: languageModel,
      stopWhen: stepCountIs(16),
    },
  );

  const parsed = parseDraftAnswer(cleanModelText(firstPass.text), String(paper._id));
  if (parsed) {
    return parsed;
  }

  const repair = await paperSummaryAgent.generateText(
    ctx,
    { threadId },
    {
      system: systemPrompt,
      prompt:
        "Rewrite your previous work as strict JSON matching the required schema. Return JSON only and do not call more tools.",
      model: languageModel,
      tools: {},
    },
  );

  return (
    parseDraftAnswer(cleanModelText(repair.text), String(paper._id)) ??
    fallbackSummaryDraft(
      cleanModelText(firstPass.text) || cleanModelText(repair.text),
      String(paper._id),
    )
  );
}

async function validateSummaryCitations(
  ctx: ActionCtx,
  paper: Doc<"papers">,
  content: string,
) {
  const uniqueRefIds = listUniqueCitationRefIds(content);
  if (!paper.activeIndexVersion || uniqueRefIds.length === 0) {
    return validateCitations([], content, false);
  }

  const chunks = await ctx.runQuery(api.paperChunks.getByRefIds, {
    paperId: paper._id,
    indexVersion: paper.activeIndexVersion,
    refIds: uniqueRefIds,
  });

  return validateCitations(
    chunks.map((chunk: { refId: string }) => ({
      refId: chunk.refId,
      paperId: String(paper._id),
      indexVersion: paper.activeIndexVersion!,
    })),
    content,
    false,
  );
}

async function validateSummaryGuide(
  ctx: ActionCtx,
  paper: Doc<"papers">,
  sourcePaths: string[],
  guide: string,
) {
  const citationValidation = await validateSummaryCitations(ctx, paper, guide);
  const sourceLeaks = detectSourceFileLeaks(guide, sourcePaths);
  const issues: string[] = [];

  if (citationValidation.invalidRefIds.length > 0) {
    issues.push(`Invalid citation refIds: ${citationValidation.invalidRefIds.join(", ")}`);
  }
  if (citationValidation.ambiguousRefIds.length > 0) {
    issues.push(`Ambiguous citation refIds: ${citationValidation.ambiguousRefIds.join(", ")}`);
  }
  if (sourceLeaks.exactPaths.length > 0) {
    issues.push(`Source file path leak: ${sourceLeaks.exactPaths.join(", ")}`);
  }
  if (sourceLeaks.genericPaths.length > 0) {
    issues.push(`Generic TeX path leak: ${sourceLeaks.genericPaths.join(", ")}`);
  }
  if (sourceLeaks.malformedCitationTokens.length > 0) {
    issues.push(
      `Malformed citation tokens: ${sourceLeaks.malformedCitationTokens.join(", ")}`,
    );
  }

  return {
    citationValidation,
    issues,
    isValid: issues.length === 0,
  };
}

async function runSummaryGroundingPass(
  ctx: ActionCtx,
  paper: Doc<"papers">,
  draft: DraftAnswer,
  languageModel: ReturnType<typeof resolveModel>,
) {
  const { threadId } = await paperGroundingAgent.createThread(ctx, {});
  const result = await paperGroundingAgent.generateText(
    ctx,
    { threadId },
    {
      system: buildSummaryGroundingSystemPrompt({
        _id: String(paper._id),
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
      }),
      prompt: buildSummaryGroundingPrompt(draft),
      model: languageModel,
      stopWhen: stepCountIs(16),
    },
  );
  return cleanModelText(result.text);
}

async function runSummaryRepairPass(
  ctx: ActionCtx,
  paper: Doc<"papers">,
  draft: DraftAnswer,
  invalidGuide: string,
  issues: string[],
  languageModel: ReturnType<typeof resolveModel>,
) {
  const { threadId } = await paperGroundingAgent.createThread(ctx, {});
  const result = await paperGroundingAgent.generateText(
    ctx,
    { threadId },
    {
      system: buildSummaryGroundingSystemPrompt({
        _id: String(paper._id),
        title: paper.title,
        authors: paper.authors,
        abstract: paper.abstract,
      }),
      prompt: buildSummaryRepairPrompt(draft, invalidGuide, issues),
      model: languageModel,
      tools: {},
    },
  );
  return cleanModelText(result.text);
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
      summary: "",
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
    let sourceFiles: SourceFile[] = [];

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
        sourceFiles = await extractSourceFiles(sourceBuffer);
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
    const sourceTitles = extractTopLevelSectionTitles(sourceFiles);
    let sectionOutline = mapSectionTitlesToPages(pageTexts, sourceTitles);
    if (sectionOutline.length < 2) {
      sectionOutline = extractOutlineFromPdf(pageTexts);
    }

    await ctx.runMutation(api.paperIndexes.create, {
      paperId,
      version: EVIDENCE_INDEX_VERSION,
      extractorVersion: EVIDENCE_EXTRACTOR_VERSION,
      createdAt: new Date().toISOString(),
      sectionOutline: sectionOutline.length > 0 ? sectionOutline : undefined,
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

    const languageModel = resolveModel();
    const sourceFiles = await ctx.runQuery(api.paperSourceFiles.listByPaper, {
      paperId: paper._id,
    });
    const sourcePaths = (sourceFiles as { relativePath: string }[]).map(
      (file) => file.relativePath,
    );

    const draft = await runSummaryDraftPass(ctx, paper, languageModel);
    let guide = await runSummaryGroundingPass(ctx, paper, draft, languageModel);

    let validation = await validateSummaryGuide(ctx, paper, sourcePaths, guide);

    if (!validation.isValid) {
      const repaired = await runSummaryRepairPass(
        ctx,
        paper,
        draft,
        guide,
        validation.issues,
        languageModel,
      );
      if (repaired.trim()) {
        guide = repaired;
        validation = await validateSummaryGuide(ctx, paper, sourcePaths, guide);
      }
    }

    if (!validation.isValid) {
      const stripped = stripUnsafeContent(guide, sourcePaths);
      if (stripped.trim()) {
        const strippedValidation = await validateSummaryGuide(
          ctx,
          paper,
          sourcePaths,
          stripped,
        );
        if (strippedValidation.isValid) {
          guide = stripped;
          validation = strippedValidation;
        }
      }
    }

    if (!validation.isValid || !guide.trim()) {
      guide = buildSummaryFallbackGuide();
    }

    await ctx.runMutation(api.papers.updateSummary, {
      id: paperId,
      summary: guide,
    });
  },
});
