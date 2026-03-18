import { Agent, createTool } from "@convex-dev/agent";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { components } from "../_generated/api";
import { z } from "zod/v4";
import { MODEL_OPTIONS, DEFAULT_MODEL } from "../lib/modelConfig";
import { resolveEffectiveModelId } from "../lib/openRouterModels";

// --- OpenRouter provider ---

function getOpenRouterProvider() {
  const referer =
    process.env.OPENROUTER_HTTP_REFERER ??
    process.env.NEXT_PUBLIC_CONVEX_SITE_URL;
  const title = process.env.OPENROUTER_APP_TITLE ?? "cool-paper";

  return createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    headers: {
      ...(referer ? { "HTTP-Referer": referer } : {}),
      ...(title ? { "X-Title": title } : {}),
    },
    ...(process.env.OPENROUTER_BASE_URL
      ? { baseURL: process.env.OPENROUTER_BASE_URL }
      : {}),
  });
}

// --- Model resolution ---

/**
 * Resolve an alias (e.g. "haiku") to the concrete model ID for the active
 * provider.  Falls back to treating the value as a direct model ID if it
 * doesn't match any configured alias.
 */
function resolveModelId(alias?: string): string {
  const id = alias?.trim() || DEFAULT_MODEL;
  const option = MODEL_OPTIONS.find((m) => m.id === id);
  if (!option) return id; // not a known alias → treat as raw model ID

  return resolveEffectiveModelId(option);
}

export function resolveModel(modelId?: string) {
  const name = resolveModelId(modelId);
  return getOpenRouterProvider().chat(name);
}

// --- Citation / annotation rules (shared prompts) ---

export function toolWorkflow() {
  return `You have access to tools to search evidence chunks, read paper source files, and view user annotations.

Workflow:
1. Use searchEvidence to find relevant evidence chunks. Each chunk has a refId — these are the ONLY valid values for [[cite:<refId>]] tokens.
2. Optionally use readSourceFile for deeper context (e.g. reading TeX/bib), but source files do NOT provide refIds.
3. Use getAnnotations to see user highlights and notes.
4. Write your response with inline [[cite:<refId>]] tokens using refIds from searchEvidence results.

IMPORTANT: refIds are opaque identifiers like "2301_12345_p003_a8f29bc012". They come exclusively from searchEvidence or getChunksByPage results. File names, paths, section titles, or any other strings are NOT valid refIds.`;
}

export function citationRules() {
  return `Citation rules:
- Citation token format: [[cite:<refId>]] where refId is ONLY a value from the "refId" field in searchEvidence or getChunksByPage results.
- NEVER use file names, paths, section titles, or invented strings as refIds.
- Every non-trivial factual claim about a paper must include at least one inline citation token.
- Do not invent page numbers, bibliography-style citations, or freeform citation text.
- If you have not yet called searchEvidence, do so before citing.
- If the evidence does not support a claim, say that directly and do not cite it.`;
}

export function annotationRules() {
  return `Annotation rules:
- Saved user highlights and notes may be referenced with [[annot:<annotationId>]].
- Use only annotation ids returned by the getAnnotations tool.
- Annotation tokens are optional and only for referring to saved user annotations.
- Do not use annotation tokens as substitutes for evidence citations.`;
}

// Lazy api accessor to avoid circular type inference
async function getApi(): Promise<any> {
  return (await import("../_generated/api")).api;
}

// --- Tools ---

const readSourceFile = createTool({
  description:
    "Read the raw content of a TeX, bib, or other source file from the paper. Use listSourceFiles first to discover available files.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
    relativePath: z
      .string()
      .describe("Relative path of the file, e.g. 'main.tex'"),
  }),
  handler: async (ctx: any, { paperId, relativePath }: { paperId: string; relativePath: string }) => {
    const api = await getApi();
    const result = await ctx.runQuery(api.paperSourceFiles.getByPath, {
      paperId: paperId as any,
      relativePath,
    });
    if (!result) {
      return { error: `File not found: ${relativePath}` };
    }
    return {
      relativePath: result.relativePath,
      fileType: result.fileType,
      content: result.content,
    };
  },
});

const listSourceFiles = createTool({
  description:
    "List all source files (TeX, bib, etc.) for a paper. Returns relative paths and file types.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
  }),
  handler: async (ctx: any, { paperId }: { paperId: string }) => {
    const api = await getApi();
    const files = await ctx.runQuery(api.paperSourceFiles.listByPaper, {
      paperId: paperId as any,
    });
    return files.map((f: any) => ({
      relativePath: f.relativePath,
      fileType: f.fileType,
    }));
  },
});

const searchEvidence = createTool({
  description:
    "Search evidence chunks from the paper's PDF. Returns chunks with refId, page, section, and text. Use the refId in [[cite:<refId>]] tokens.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
    query: z
      .string()
      .describe("Text to search for in evidence chunks")
      .optional(),
    page: z.number().describe("Filter by page number").optional(),
    section: z.string().describe("Filter by section name").optional(),
    limit: z
      .number()
      .describe("Max results to return (default 20)")
      .optional(),
  }),
  handler: async (ctx: any, args: { paperId: string; query?: string; page?: number; section?: string; limit?: number }) => {
    const api = await getApi();
    const { paperId, query, page, section, limit = 20 } = args;
    return await ctx.runQuery(api.paperChunks.search, {
      paperId: paperId as any,
      query,
      page,
      section,
      limit,
    });
  },
});

const getChunksByPage = createTool({
  description: "Get all evidence chunks for a specific page of a paper.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
    page: z.number().describe("Page number"),
  }),
  handler: async (ctx: any, { paperId, page }: { paperId: string; page: number }) => {
    const api = await getApi();
    const chunks = await ctx.runQuery(api.paperChunks.listByPage, {
      paperId: paperId as any,
      page,
    });
    return chunks.map((c: any) => ({
      refId: c.refId,
      page: c.page,
      order: c.order,
      section: c.section,
      text: c.text,
    }));
  },
});

const getAnnotations = createTool({
  description:
    "Get saved user annotations (highlights and notes) for a paper.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
  }),
  handler: async (ctx: any, { paperId }: { paperId: string }) => {
    const api = await getApi();
    const annotations = await ctx.runQuery(api.annotations.listByPaper, {
      paperId: paperId as any,
    });
    return annotations.map((a: any) => ({
      annotationId: String(a._id),
      page: a.page,
      kind: a.kind,
      comment: a.comment,
      exact: a.exact.slice(0, 300),
    }));
  },
});

const sharedPaperTools = {
  readSourceFile,
  listSourceFiles,
  searchEvidence,
  getChunksByPage,
  getAnnotations,
};

// --- Agent definition ---

// languageModel is required by the Agent constructor but always overridden
// at runtime via the `model` option in generateText().
export const paperAgent = new Agent(components.agent, {
  name: "paper-assistant",
  languageModel: getOpenRouterProvider().chat("anthropic/claude-haiku-4.5") as unknown as LanguageModelV2,
  instructions: `You are an expert academic paper analyst. You help users understand, discuss, and analyze research papers.

${toolWorkflow()}

${citationRules()}
${annotationRules()}`,
  tools: sharedPaperTools,
});

export const paperSummaryAgent = new Agent(components.agent, {
  name: "paper-summary-assistant",
  languageModel: getOpenRouterProvider().chat("anthropic/claude-haiku-4.5") as unknown as LanguageModelV2,
  instructions: `You are an expert academic paper reader creating a concise but high-signal reading summary.

Prioritize TeX, BibTeX, and other source files when they are available. Use PDF evidence only as a fallback when the source files are incomplete.

Workflow:
1. Use listSourceFiles to inspect the source tree.
2. Read the most relevant TeX and bibliography files with readSourceFile.
3. Use searchEvidence or getChunksByPage only when the source files are insufficient.
4. Return clean markdown only.
5. Use inline math with $...$ and display math with $$...$$ when helpful.
6. Do not emit citation tokens or annotation tokens.`,
  tools: sharedPaperTools,
});
