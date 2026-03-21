"use node";

import { action, internalAction, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { workflow } from "../workflow";
import {
  annotationRules,
  citationRules,
  draftOutputRules,
  draftWorkflow,
  groundingWorkflow,
  paperAgent,
  paperGroundingAgent,
  resolveModel,
  toolWorkflow,
} from "../agents/paper";
import { stepCountIs } from "@convex-dev/agent";
import {
  listUniqueCitationRefIds,
  validateCitations,
  type CitationResolutionResult,
} from "../lib/citations";
import {
  detectSourceFileLeaks,
  parseDraftAnswer,
  stripUnsafeContent,
  type DraftAnswer,
  type DraftClaim,
} from "../lib/grounding";
import { parseThinkTags } from "../lib/modelConfig";
import type { Doc, Id } from "../_generated/dataModel";

function cleanModelText(text?: string): string {
  if (!text) return "";
  return parseThinkTags(text).content.trim();
}

function generateThreadTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const truncated = cleaned.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
}

async function validateAssistantCitations(
  ctx: ActionCtx,
  papers: Doc<"papers">[],
  content: string,
): Promise<CitationResolutionResult> {
  const uniqueRefIds = listUniqueCitationRefIds(content);
  const chunkResolutions: {
    refId: string;
    paperId: string;
    indexVersion: number;
  }[] = [];

  for (const paper of papers) {
    if (!paper.activeIndexVersion || uniqueRefIds.length === 0) continue;
    const chunks = await ctx.runQuery(api.paperChunks.getByRefIds, {
      paperId: paper._id,
      indexVersion: paper.activeIndexVersion,
      refIds: uniqueRefIds,
    });
    for (const chunk of chunks) {
      chunkResolutions.push({
        refId: chunk.refId,
        paperId: String(paper._id),
        indexVersion: paper.activeIndexVersion,
      });
    }
  }

  return validateCitations(chunkResolutions, content, true);
}

async function listSourcePathsForPapers(
  ctx: ActionCtx,
  papers: Doc<"papers">[],
): Promise<string[]> {
  const fileLists = (await Promise.all(
    papers.map((paper) =>
      ctx.runQuery(api.paperSourceFiles.listByPaper, {
        paperId: paper._id,
      }),
    ),
  )) as { relativePath: string }[][];

  const relativePaths: string[] = [];
  for (const files of fileLists) {
    for (const file of files) {
      relativePaths.push(file.relativePath);
    }
  }

  return [...new Set(relativePaths)];
}

function buildConversationBlock(messages: Doc<"messages">[]): string {
  const recent = messages.slice(-10);
  if (recent.length === 0) return "Conversation so far: none.";

  const lines = recent.map((entry) => {
    const role = entry.role === "assistant" ? "Assistant" : "User";
    const content =
      entry.content.length > 1000
        ? `${entry.content.slice(0, 1000)}…`
        : entry.content;
    return `${role}: ${content}`;
  });

  return `Conversation so far:\n${lines.join("\n\n")}`;
}

function buildPaperContextBlock(papers: Doc<"papers">[]): string {
  if (papers.length === 1) {
    const paper = papers[0]!;
    return `Paper:
Title: ${paper.title}
Abstract: ${paper.abstract}
paperId: ${paper._id}`;
  }

  return `Papers:\n${papers
    .map(
      (paper) => `- "${paper.title}"
  paperId: ${paper._id}
  Abstract: ${paper.abstract.slice(0, 400)}${paper.abstract.length > 400 ? "…" : ""}`,
    )
    .join("\n\n")}`;
}

function formatAnnotationBlock(annotations: Doc<"annotations">[]): string {
  if (annotations.length === 0) return "Saved annotations: none.";

  const entries = annotations
    .slice(0, 24)
    .map((annotation) => {
      const excerpt =
        annotation.exact.length > 220
          ? `${annotation.exact.slice(0, 220)}…`
          : annotation.exact;
      const comment = annotation.comment?.trim();
      return `- [[annot:${annotation._id}]] ${annotation.kind} on page ${annotation.page}
  Excerpt: "${excerpt}"
  ${comment ? `Comment: "${comment}"` : "Comment: none"}`;
    })
    .join("\n");

  return `Saved user annotations:\n${entries}`;
}

function buildAnnotationContext(
  papers: Doc<"papers">[],
  annotationsByPaper: Map<string, Doc<"annotations">[]>,
): string {
  return papers
    .map((paper) => {
      const annotations = annotationsByPaper.get(String(paper._id)) ?? [];
      return `Annotations for paperId ${paper._id}:\n${formatAnnotationBlock(annotations)}`;
    })
    .join("\n\n");
}

function buildDraftSchemaPrompt() {
  return `Return strict JSON matching this shape:
{
  "lead": "optional short opening paragraph",
  "claims": [
    {
      "id": "claim_1",
      "section": "optional section label",
      "paperId": "paper id for the claim",
      "text": "one atomic factual sentence",
      "groundingQueries": ["1 to 3 short PDF search queries"],
      "optional": false
    }
  ],
  "closing": "optional short closing paragraph"
}

Rules:
- Claims must be atomic.
- Claims must omit inline citations.
- groundingQueries should reuse paper terminology likely to appear verbatim in the PDF.
- Set paperId on every claim when multiple papers are in scope.`;
}

function buildChatDraftSystemPrompt(
  papers: Doc<"papers">[],
  annotationsByPaper: Map<string, Doc<"annotations">[]>,
): string {
  return `You are preparing an internal structured draft for a user-facing grounded response.

${buildPaperContextBlock(papers)}

${buildAnnotationContext(papers, annotationsByPaper)}

${toolWorkflow()}
${draftWorkflow()}
${draftOutputRules()}
${annotationRules()}

${buildDraftSchemaPrompt()}`;
}

function buildChatDraftPrompt(
  messages: Doc<"messages">[],
  message: string,
): string {
  return `${buildConversationBlock(messages)}

Latest user request:
${message}

Produce the JSON draft now.`;
}

function buildGroundingSystemPrompt(papers: Doc<"papers">[]): string {
  return `You are preparing the final user-visible answer from a structured draft.

${buildPaperContextBlock(papers)}

${groundingWorkflow()}
${citationRules()}

Output markdown only.
- Preserve the substance of the draft, but only keep claims you can ground to PDF evidence.
- Every retained factual sentence must include at least one valid inline citation token.
- Never mention TeX source file names, source paths, or tool names.
- If needed, briefly qualify that some details could not be grounded in the PDF.`;
}

function buildGroundingPrompt(draft: DraftAnswer): string {
  return `Here is the structured draft to ground to PDF evidence:

\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Write the final cited markdown answer now.`;
}

function buildRepairPrompt(
  draft: DraftAnswer,
  invalidText: string,
  issues: string[],
): string {
  return `The previous grounded answer was invalid.

Validation issues:
${issues.map((issue) => `- ${issue}`).join("\n")}

Invalid answer:

${invalidText}

Original draft:

\`\`\`json
${JSON.stringify(draft, null, 2)}
\`\`\`

Rewrite the final markdown so that every factual claim has valid PDF citations, and no TeX filenames or source paths appear.`;
}

function fallbackDraftAnswer(
  rawText: string,
  defaultPaperId?: string,
): DraftAnswer {
  const cleaned = cleanModelText(rawText)
    .replace(/\s+/g, " ")
    .trim();
  const sentenceMatches = cleaned.match(/[^.!?]+[.!?]?/g) ?? [];
  const claims: DraftClaim[] = sentenceMatches
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .slice(0, 8)
    .map((sentence, index) => ({
      id: `claim_${index + 1}`,
      text: sentence,
      groundingQueries: [sentence.slice(0, 220)],
      optional: false,
      paperId: defaultPaperId,
    }));

  return {
    claims,
  };
}

async function runDraftPass(
  ctx: ActionCtx,
  papers: Doc<"papers">[],
  annotationsByPaper: Map<string, Doc<"annotations">[]>,
  messages: Doc<"messages">[],
  message: string,
  languageModel: ReturnType<typeof resolveModel>,
): Promise<DraftAnswer> {
  const { threadId } = await paperAgent.createThread(ctx, {});
  const defaultPaperId =
    papers.length === 1 ? String(papers[0]!._id) : undefined;
  const systemPrompt = buildChatDraftSystemPrompt(papers, annotationsByPaper);

  const firstPass = await paperAgent.generateText(
    ctx,
    { threadId },
    {
      system: systemPrompt,
      prompt: buildChatDraftPrompt(messages, message),
      model: languageModel,
      stopWhen: stepCountIs(16),
    },
  );

  const firstText = cleanModelText(firstPass.text);
  const parsedFirst = parseDraftAnswer(firstText, defaultPaperId);
  if (parsedFirst) {
    return parsedFirst;
  }

  const repair = await paperAgent.generateText(
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

  const repaired = parseDraftAnswer(cleanModelText(repair.text), defaultPaperId);
  return repaired ?? fallbackDraftAnswer(firstText || cleanModelText(repair.text), defaultPaperId);
}

interface FinalValidation {
  citationValidation: CitationResolutionResult;
  sourceLeaks: ReturnType<typeof detectSourceFileLeaks>;
  issues: string[];
  isValid: boolean;
}

async function validateFinalAnswer(
  ctx: ActionCtx,
  papers: Doc<"papers">[],
  sourcePaths: string[],
  content: string,
): Promise<FinalValidation> {
  const citationValidation = await validateAssistantCitations(ctx, papers, content);
  const sourceLeaks = detectSourceFileLeaks(content, sourcePaths);
  const issues: string[] = [];

  if (citationValidation.missingRequiredCitations) {
    issues.push("Missing required PDF citations.");
  }
  if (citationValidation.invalidRefIds.length > 0) {
    issues.push(
      `Invalid citation refIds: ${citationValidation.invalidRefIds.join(", ")}`,
    );
  }
  if (citationValidation.ambiguousRefIds.length > 0) {
    issues.push(
      `Ambiguous citation refIds: ${citationValidation.ambiguousRefIds.join(", ")}`,
    );
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
    sourceLeaks,
    issues,
    isValid: issues.length === 0,
  };
}

async function loadPaperContext(ctx: ActionCtx, paperIds: string[]) {
  const papers: Doc<"papers">[] = [];
  const annotationsByPaper = new Map<string, Doc<"annotations">[]>();
  for (const pid of paperIds) {
    const paper = await ctx.runQuery(api.papers.get, { sanitizedId: pid });
    if (!paper) continue;
    papers.push(paper);
    const annotations = await ctx.runQuery(api.annotations.listByPaper, {
      paperId: paper._id,
    });
    annotationsByPaper.set(String(paper._id), annotations);
  }

  if (papers.length === 0) {
    throw new Error("No valid papers found for this thread");
  }

  return { papers, annotationsByPaper };
}

async function runGroundingPass(
  ctx: ActionCtx,
  threadId: Id<"threads">,
  papers: Doc<"papers">[],
  draft: DraftAnswer,
  languageModel: ReturnType<typeof resolveModel>,
): Promise<string> {
  const { threadId: groundingThreadId } = await paperGroundingAgent.createThread(
    ctx,
    {},
  );
  await ctx.runMutation(api.threads.updateAgentThread, {
    id: threadId,
    agentThreadId: groundingThreadId,
  });

  const result = await paperGroundingAgent.streamText(
    ctx,
    { threadId: groundingThreadId },
    {
      system: buildGroundingSystemPrompt(papers),
      prompt: buildGroundingPrompt(draft),
      model: languageModel,
      stopWhen: stepCountIs(16),
    },
    { saveStreamDeltas: true },
  );

  return cleanModelText(await result.text);
}

async function runRepairPass(
  ctx: ActionCtx,
  userThreadId: Id<"threads">,
  papers: Doc<"papers">[],
  draft: DraftAnswer,
  invalidText: string,
  issues: string[],
  languageModel: ReturnType<typeof resolveModel>,
): Promise<string> {
  const { threadId } = await paperGroundingAgent.createThread(ctx, {});
  // Point the user-facing thread at the repair agent thread so the client
  // can subscribe to streaming deltas for this pass too.
  await ctx.runMutation(api.threads.updateAgentThread, {
    id: userThreadId,
    agentThreadId: threadId,
  });
  const result = await paperGroundingAgent.streamText(
    ctx,
    { threadId },
    {
      system: buildGroundingSystemPrompt(papers),
      prompt: buildRepairPrompt(draft, invalidText, issues),
      model: languageModel,
      tools: {},
    },
    { saveStreamDeltas: true },
  );

  return cleanModelText(await result.text);
}

// ---------------------------------------------------------------------------
// Workflow-based chat: startChat + step actions
// ---------------------------------------------------------------------------

export const startChat = action({
  args: {
    threadId: v.id("threads"),
    message: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, message, model }) => {
    // Snapshot paper context before anything else
    const thread = await ctx.runQuery(api.threads.get, { id: threadId });
    if (!thread) throw new Error("Thread not found");
    const paperIds = thread.paperIds;

    const generation = await ctx.runMutation(
      internal.threads.setChatGenerating,
      { id: threadId },
    );

    const messages = await ctx.runQuery(api.messages.listByThread, {
      threadId,
    });
    const userMessages = messages.filter(
      (m: { role: string }) => m.role === "user",
    );
    if (userMessages.length <= 1) {
      await ctx.runMutation(api.threads.updateTitle, {
        id: threadId,
        title: generateThreadTitle(message),
      });
    }

    try {
      await workflow.start(ctx, internal.workflows.chat.runChat, {
        threadId,
        message,
        model,
        paperIds,
        generation,
      });
    } catch (e) {
      await ctx.runMutation(internal.threads.clearChatStatus, {
        id: threadId,
      });
      throw e;
    }
  },
});

export const draftPass = internalAction({
  args: {
    threadId: v.id("threads"),
    message: v.string(),
    model: v.optional(v.string()),
    paperIds: v.array(v.string()),
    generation: v.number(),
  },
  handler: async (ctx, { threadId, message, model, paperIds, generation }) => {
    const thread = await ctx.runQuery(api.threads.get, { id: threadId });
    if (!thread || thread.chatGeneration !== generation) {
      throw new Error("Chat generation stale");
    }
    const { papers, annotationsByPaper } = await loadPaperContext(
      ctx,
      paperIds,
    );
    const existingMessages = await ctx.runQuery(api.messages.listByThread, {
      threadId,
    });
    const languageModel = resolveModel(model);
    const sourcePaths = await listSourcePathsForPapers(ctx, papers);

    const draft = await runDraftPass(
      ctx,
      papers,
      annotationsByPaper,
      existingMessages,
      message,
      languageModel,
    );

    return { draftJson: JSON.stringify(draft), sourcePaths };
  },
});

export const groundAndValidate = internalAction({
  args: {
    threadId: v.id("threads"),
    draftJson: v.string(),
    sourcePaths: v.array(v.string()),
    model: v.optional(v.string()),
    paperIds: v.array(v.string()),
    generation: v.number(),
  },
  handler: async (ctx, { threadId, draftJson, sourcePaths, model, paperIds, generation }) => {
    const thread = await ctx.runQuery(api.threads.get, { id: threadId });
    if (!thread || thread.chatGeneration !== generation) {
      throw new Error("Chat generation stale");
    }
    const { papers } = await loadPaperContext(ctx, paperIds);
    const draft = JSON.parse(draftJson) as DraftAnswer;
    const languageModel = resolveModel(model);

    const assistantText = await runGroundingPass(
      ctx,
      threadId,
      papers,
      draft,
      languageModel,
    );

    const validation = await validateFinalAnswer(
      ctx,
      papers,
      sourcePaths,
      assistantText,
    );

    return {
      assistantText,
      citationEntries: validation.citationValidation.entries.map((e) => ({
        paperId: e.paperId as Id<"papers">,
        indexVersion: e.indexVersion,
        refId: e.refId,
        occurrence: e.occurrence,
      })),
      issues: validation.issues,
      isValid: validation.isValid,
    };
  },
});

export const repairPass = internalAction({
  args: {
    threadId: v.id("threads"),
    draftJson: v.string(),
    invalidText: v.string(),
    issues: v.array(v.string()),
    sourcePaths: v.array(v.string()),
    model: v.optional(v.string()),
    paperIds: v.array(v.string()),
    generation: v.number(),
  },
  handler: async (
    ctx,
    { threadId, draftJson, invalidText, issues, sourcePaths, model, paperIds, generation },
  ) => {
    const thread = await ctx.runQuery(api.threads.get, { id: threadId });
    if (!thread || thread.chatGeneration !== generation) {
      throw new Error("Chat generation stale");
    }
    const { papers } = await loadPaperContext(ctx, paperIds);
    const draft = JSON.parse(draftJson) as DraftAnswer;
    const languageModel = resolveModel(model);

    const repairedText = await runRepairPass(
      ctx,
      threadId,
      papers,
      draft,
      invalidText,
      issues,
      languageModel,
    );

    let assistantText = repairedText.trim() ? repairedText : invalidText;
    let validation = await validateFinalAnswer(
      ctx,
      papers,
      sourcePaths,
      assistantText,
    );

    if (!validation.isValid) {
      const stripped = stripUnsafeContent(assistantText, sourcePaths);
      if (stripped.trim()) {
        const strippedValidation = await validateFinalAnswer(
          ctx,
          papers,
          sourcePaths,
          stripped,
        );
        if (strippedValidation.isValid) {
          assistantText = stripped;
          validation = strippedValidation;
        }
      }
    }

    if (!validation.isValid) {
      assistantText =
        "I couldn't ground a reliable cited answer for that in the PDF.";
      validation = await validateFinalAnswer(
        ctx,
        papers,
        sourcePaths,
        assistantText,
      );
    }

    return {
      assistantText,
      citationEntries: validation.citationValidation.entries.map((e) => ({
        paperId: e.paperId as Id<"papers">,
        indexVersion: e.indexVersion,
        refId: e.refId,
        occurrence: e.occurrence,
      })),
    };
  },
});

