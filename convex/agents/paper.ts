import { Agent, createTool, type ToolCtx as AgentToolCtx } from "@convex-dev/agent";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { components } from "../_generated/api";
import { z } from "zod/v4";
import { MODEL_OPTIONS, DEFAULT_MODEL } from "../lib/modelConfig";
import { resolveEffectiveModelId } from "../lib/openRouterModels";
import type { ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import type { Tool } from "ai";

// NOTE: This module accesses process.env and must only be imported from
// "use node" runtime files (actions/chat.ts, actions/importPaper.ts).

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

/**
 * Placeholder language model — always overridden at runtime via the `model`
 * option passed to each agent. The double cast is required because
 * @openrouter/ai-sdk-provider returns LanguageModelV1 which is structurally
 * compatible but nominally incompatible with LanguageModelV2.
 */
function placeholderModel(): LanguageModelV2 {
  return getOpenRouterProvider().chat(
    "qwen/qwen3.5-35b-a3b"
  ) as unknown as LanguageModelV2;
}

// --- Model resolution ---

/**
 * Resolve an alias (e.g. "haiku") to a concrete language model for the active
 * provider.  Falls back to treating the value as a direct model ID if it
 * doesn't match any configured alias.
 *
 * When the matched ModelOption has `providerPreferences`, those are forwarded
 * to the OpenRouter SDK so the request uses the configured provider routing.
 * @see https://openrouter.ai/docs/guides/routing/provider-selection
 */
export function resolveModel(modelId?: string) {
  const id = modelId?.trim() || DEFAULT_MODEL;
  const option = MODEL_OPTIONS.find((m) => m.id === id);
  const name = option ? resolveEffectiveModelId(option) : id;
  const providerPreferences = option?.providerPreferences;

  return getOpenRouterProvider().chat(name, {
    ...(providerPreferences ? { provider: providerPreferences } : {}),
  });
}

// --- Citation / annotation rules (shared prompts) ---

export function toolWorkflow() {
  return `You have access to tools to search evidence chunks, read paper source files, and view user annotations.

Workflow:
1. Use searchEvidence to find relevant evidence chunks. Each chunk has a refId — these are the ONLY valid values for [[cite:<refId>]] tokens.
2. Optionally use readSourceFile for deeper context from TeX source files, but source files do NOT provide refIds.
3. Use getAnnotations to see user highlights and notes.
4. Write your response with inline [[cite:<refId>]] tokens using refIds from searchEvidence results.

IMPORTANT: refIds are opaque identifiers like "2301_12345_p003_a8f29bc012". They come exclusively from searchEvidence or getChunksByPage results. File names, paths, section titles, or any other strings are NOT valid refIds.`;
}

export function draftWorkflow() {
  return `Draft workflow:
- Use TeX source files as the primary source of truth when they are available.
- Use PDF evidence tools when TeX is incomplete, ambiguous, or when you need wording that is likely to appear in the PDF.
- Return a structured uncited draft only.
- Do not mention file names, source paths, tool names, or internal workflow details.
- Do not emit citation tokens or annotation tokens unless the system prompt explicitly asks for them.`;
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

export function groundingWorkflow() {
  return `Grounding workflow:
1. Read the provided draft claims.
2. Use only PDF evidence tools to ground those claims to refIds.
3. Emit final markdown for the user with inline [[cite:<refId>]] tokens.
4. Drop or explicitly qualify any claim that cannot be grounded in the PDF.

IMPORTANT: Never mention TeX source file names or source paths in the output.`;
}

export function draftOutputRules() {
  return `Draft output rules:
- Return JSON only when the system prompt asks for JSON.
- Keep each claim atomic and concise.
- For each claim include grounding queries that are likely to match PDF wording.
- Do not include filenames such as main.tex or paths such as sections/method.tex.
- Do not include any citation or annotation tokens in draft output.`;
}

export function annotationRules() {
  return `Annotation rules:
- Saved user highlights and notes may be referenced with [[annot:<annotationId>]].
- Use only annotation ids returned by the getAnnotations tool.
- Annotation tokens are optional and only for referring to saved user annotations.
- Do not use annotation tokens as substitutes for evidence citations.`;
}

type ToolCtx = AgentToolCtx & Pick<ActionCtx, "runQuery">;
type SourceFileDoc = Doc<"paper_source_files">;
type AnnotationDoc = Doc<"annotations">;
type ReadSourceFileTool = Tool<
  { paperId: string; relativePath: string },
  { relativePath: string; fileType: string; content: string } | { error: string }
>;
type ListSourceFilesTool = Tool<
  { paperId: string },
  { relativePath: string; fileType: string }[]
>;
type SearchEvidenceTool = Tool<
  {
    paperId: string;
    query?: string;
    page?: number;
    section?: string;
    limit?: number;
  },
  {
    refId: string;
    page: number;
    order: number;
    section?: string;
    text: string;
  }[]
>;
type GetChunksByPageTool = Tool<
  { paperId: string; page: number },
  {
    refId: string;
    page: number;
    order: number;
    section?: string;
    text: string;
  }[]
>;
type GetAnnotationsTool = Tool<
  { paperId: string },
  {
    annotationId: string;
    page: number;
    kind: AnnotationDoc["kind"];
    comment: AnnotationDoc["comment"];
    exact: string;
  }[]
>;

// --- Tools ---

function isTexSourcePath(relativePath: string): boolean {
  return relativePath.toLowerCase().endsWith(".tex");
}

function isToolVisibleTexFile(file: {
  relativePath: string;
  fileType?: string;
}): boolean {
  return isTexSourcePath(file.relativePath) && file.fileType?.toLowerCase() === "tex";
}

const readSourceFile: ReadSourceFileTool = createTool<
  { paperId: string; relativePath: string },
  { relativePath: string; fileType: string; content: string } | { error: string },
  ToolCtx
>({
  description:
    "Read the raw content of a .tex source file from the paper. Use listSourceFiles first to discover available files.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
    relativePath: z
      .string()
      .describe("Relative path of the file, e.g. 'main.tex'"),
  }),
  handler: async (
    ctx: ToolCtx,
    { paperId, relativePath }: { paperId: string; relativePath: string },
  ): Promise<
    { relativePath: string; fileType: string; content: string } | { error: string }
  > => {
    if (!isTexSourcePath(relativePath)) {
      return { error: `Only .tex files are supported: ${relativePath}` };
    }

    const api = (await import("../_generated/api")).api;
    const result = await ctx.runQuery(api.paperSourceFiles.getByPath, {
      paperId: paperId as Id<"papers">,
      relativePath,
    });
    if (!result) {
      return { error: `File not found: ${relativePath}` };
    }
    if (!isToolVisibleTexFile(result)) {
      return { error: `Only .tex files are supported: ${relativePath}` };
    }
    return {
      relativePath: result.relativePath,
      fileType: result.fileType,
      content: result.content,
    };
  },
});

const listSourceFiles: ListSourceFilesTool = createTool<
  { paperId: string },
  { relativePath: string; fileType: string }[],
  ToolCtx
>({
  description:
    "List all .tex source files for a paper. Returns relative paths and file types.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
  }),
  handler: async (
    ctx: ToolCtx,
    { paperId }: { paperId: string },
  ): Promise<{ relativePath: string; fileType: string }[]> => {
    const api = (await import("../_generated/api")).api;
    const files = await ctx.runQuery(api.paperSourceFiles.listByPaper, {
      paperId: paperId as Id<"papers">,
    });
    return files
      .filter((file: SourceFileDoc) => isToolVisibleTexFile(file))
      .map((file: SourceFileDoc) => ({
        relativePath: file.relativePath,
        fileType: file.fileType,
      }));
  },
});

const searchEvidence: SearchEvidenceTool = createTool<
  {
    paperId: string;
    query?: string;
    page?: number;
    section?: string;
    limit?: number;
  },
  {
    refId: string;
    page: number;
    order: number;
    section?: string;
    text: string;
  }[],
  ToolCtx
>({
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
  handler: async (
    ctx: ToolCtx,
    args: {
      paperId: string;
      query?: string;
      page?: number;
      section?: string;
      limit?: number;
    },
  ): Promise<
    {
      refId: string;
      page: number;
      order: number;
      section?: string;
      text: string;
    }[]
  > => {
    const api = (await import("../_generated/api")).api;
    const { paperId, query, page, section, limit = 20 } = args;
    return await ctx.runQuery(api.paperChunks.search, {
      paperId: paperId as Id<"papers">,
      query,
      page,
      section,
      limit,
    });
  },
});

const getChunksByPage: GetChunksByPageTool = createTool<
  { paperId: string; page: number },
  {
    refId: string;
    page: number;
    order: number;
    section?: string;
    text: string;
  }[],
  ToolCtx
>({
  description: "Get all evidence chunks for a specific page of a paper.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
    page: z.number().describe("Page number"),
  }),
  handler: async (
    ctx: ToolCtx,
    { paperId, page }: { paperId: string; page: number },
  ): Promise<
    {
      refId: string;
      page: number;
      order: number;
      section?: string;
      text: string;
    }[]
  > => {
    const api = (await import("../_generated/api")).api;
    const chunks = await ctx.runQuery(api.paperChunks.listByPage, {
      paperId: paperId as Id<"papers">,
      page,
    });
    return chunks.map((chunk) => ({
      refId: chunk.refId,
      page: chunk.page,
      order: chunk.order,
      section: chunk.section,
      text: chunk.text,
    }));
  },
});

const getAnnotations: GetAnnotationsTool = createTool<
  { paperId: string },
  {
    annotationId: string;
    page: number;
    kind: AnnotationDoc["kind"];
    comment: AnnotationDoc["comment"];
    exact: string;
  }[],
  ToolCtx
>({
  description:
    "Get saved user annotations (highlights and notes) for a paper.",
  args: z.object({
    paperId: z.string().describe("The paper ID"),
  }),
  handler: async (
    ctx: ToolCtx,
    { paperId }: { paperId: string },
  ): Promise<
    {
      annotationId: string;
      page: number;
      kind: AnnotationDoc["kind"];
      comment: AnnotationDoc["comment"];
      exact: string;
    }[]
  > => {
    const api = (await import("../_generated/api")).api;
    const annotations = await ctx.runQuery(api.annotations.listByPaper, {
      paperId: paperId as Id<"papers">,
    });
    return annotations.map((annotation: AnnotationDoc) => ({
      annotationId: String(annotation._id),
      page: annotation.page,
      kind: annotation.kind,
      comment: annotation.comment,
      exact: annotation.exact.slice(0, 300),
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

const groundingPaperTools = {
  searchEvidence,
  getChunksByPage,
};

// --- Agent definition ---

// languageModel is required by the Agent constructor but always overridden
// at runtime via the `model` option in generateText().
export const paperAgent = new Agent(components.agent, {
  name: "paper-assistant",
  languageModel: placeholderModel(),
  instructions: `You are an expert academic paper analyst. You help build accurate internal drafts about research papers.

  ${toolWorkflow()}
  ${draftWorkflow()}

  ${draftOutputRules()}
  ${annotationRules()}`,
  tools: sharedPaperTools,
});

export const paperSummaryAgent = new Agent(components.agent, {
  name: "paper-summary-assistant",
  languageModel: placeholderModel(),
  instructions: `You are an expert academic paper reader creating an internal structured reading-guide draft.

  Prioritize TeX source files when they are available. Use PDF evidence only as a fallback when the source files are incomplete.

  ${draftWorkflow()}
  ${draftOutputRules()}`,
  tools: sharedPaperTools,
});

export const paperGroundingAgent = new Agent(components.agent, {
  name: "paper-grounding-assistant",
  languageModel: placeholderModel(),
  instructions: `You are an expert academic paper analyst grounding draft claims to the paper PDF.

${groundingWorkflow()}

${citationRules()}`,
  tools: groundingPaperTools,
});
