"use node";

import { action, type ActionCtx } from "../_generated/server";
import { v } from "convex/values";
import { api } from "../_generated/api";
import {
  paperAgent,
  resolveModel,
  toolWorkflow,
  citationRules,
  annotationRules,
} from "../agents/paper";
import { stepCountIs } from "@convex-dev/agent";
import {
  listUniqueCitationRefIds,
  validateCitations,
  type CitationResolutionResult,
} from "../lib/citations";
import { parseThinkTags } from "../lib/modelConfig";
import type { Id, Doc } from "../_generated/dataModel";

type StreamTextOptions = Parameters<typeof paperAgent.streamText>[2];

interface AgentStreamResult {
  text: Promise<string>;
  reasoning: Promise<unknown>;
}

function extractStructuredThinking(reasoning: unknown): string | undefined {
  if (!reasoning) return undefined;
  if (typeof reasoning === "string") return reasoning || undefined;
  if (Array.isArray(reasoning)) {
    const parts = reasoning.flatMap((entry) => {
      if (typeof entry !== "object" || entry === null) return [];
      const part = entry as { type?: unknown; text?: unknown };
      if (
        (part.type === "reasoning" || part.type === "text") &&
        typeof part.text === "string"
      ) {
        return [part.text];
      }
      return [];
    });
    return parts.join("\n") || undefined;
  }
  return undefined;
}

function generateThreadTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const truncated = cleaned.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
}

async function extractAssistantResponse(
  result: AgentStreamResult,
): Promise<{ text: string; thinking?: string }> {
  const assistantText = await result.text;
  const reasoningData = await result.reasoning;
  const structuredThinking = extractStructuredThinking(reasoningData);
  const { thinking: tagThinking, content: cleanText } =
    parseThinkTags(assistantText);

  return {
    text: cleanText,
    thinking: structuredThinking || tagThinking || undefined,
  };
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

function buildChatSystemPrompt(
  papers: Doc<"papers">[],
  annotationsByPaper: Map<string, Doc<"annotations">[]>,
): string {
  if (papers.length === 1) {
    const paper = papers[0]!;
    const annotations = annotationsByPaper.get(String(paper._id)) ?? [];
    const annotBlock = formatAnnotationBlock(annotations);
    return `You are an expert academic paper analyst discussing a paper with the user.

Title: ${paper.title}
Abstract: ${paper.abstract}

Pass paperId="${paper._id}" to all tools.
${annotBlock}

${toolWorkflow()}

${citationRules()}
${annotationRules()}`;
  }

  const papersBlock = papers
    .map((p) => {
      const annotations = annotationsByPaper.get(String(p._id)) ?? [];
      const annotBlock = formatAnnotationBlock(annotations);
      return `Paper: "${p.title}"
  Abstract: ${p.abstract.slice(0, 300)}${p.abstract.length > 300 ? "…" : ""}
  paperId: ${p._id}
  ${annotBlock}`;
    })
    .join("\n\n");

  return `You are an expert academic paper analyst discussing papers with the user.

Papers in this conversation:
${papersBlock}

Call searchEvidence with each paper's paperId to gather citable evidence before responding.
Example: The authors of "Attention Is All You Need" propose the Transformer architecture [[cite:1706_03762_p003_a8f29bc012]].

${toolWorkflow()}

${citationRules()}
${annotationRules()}`;
}

function formatAnnotationBlock(annotations: Doc<"annotations">[]): string {
  if (annotations.length === 0) return "Saved annotations: none.";

  const entries = annotations
    .slice(0, 24)
    .map((a) => {
      const excerpt =
        a.exact.length > 220 ? `${a.exact.slice(0, 220)}…` : a.exact;
      const comment = a.comment?.trim();
      return `- [[annot:${a._id}]] ${a.kind} on page ${a.page}
  Excerpt: "${excerpt}"
  ${comment ? `Comment: "${comment}"` : "Comment: none"}`;
    })
    .join("\n");

  return `Saved user annotations:\n${entries}`;
}

export const sendMessage = action({
  args: {
    threadId: v.id("threads"),
    message: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, { threadId, message, model }): Promise<{ text: string; messageId: string }> => {
    // Load thread
    const thread = await ctx.runQuery(api.threads.get, { id: threadId });
    if (!thread) throw new Error("Thread not found");

    // Load all papers for this thread
    const papers: Doc<"papers">[] = [];
    const annotationsByPaper = new Map<string, Doc<"annotations">[]>();
    for (const pid of thread.paperIds) {
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

    // Update title on first message
    const existingMessages = await ctx.runQuery(api.messages.listByThread, {
      threadId,
    });
    const userMessages = existingMessages.filter((m: { role: string }) => m.role === "user");
    if (userMessages.length <= 1) {
      await ctx.runMutation(api.threads.updateTitle, {
        id: threadId,
        title: generateThreadTitle(message),
      });
    }

    // Get or create agent thread
    let agentThreadId = thread.agentThreadId;
    if (!agentThreadId) {
      const { threadId: newAgentThread } = await paperAgent.createThread(ctx, {});
      agentThreadId = newAgentThread;
      await ctx.runMutation(api.threads.updateAgentThread, {
        id: threadId,
        agentThreadId,
      });
    }

    // Build system prompt with paper context
    const systemPrompt = buildChatSystemPrompt(papers, annotationsByPaper);

    // Choose model
    const languageModel = resolveModel(model);

    // Stream response using agent (deltas saved to DB for real-time UI)
    const result = await paperAgent.streamText(
      ctx,
      { threadId: agentThreadId },
      {
        system: systemPrompt,
        prompt: message,
        model: languageModel,
        stopWhen: stepCountIs(16),
      } as StreamTextOptions,
      { saveStreamDeltas: true },
    );

    // Wait for the stream to complete
    let { text: assistantText, thinking } =
      await extractAssistantResponse(result);

    // If the model exhausted all steps on tool calls without producing
    // final text, do a follow-up call with no tools to force text output.
    if (!assistantText?.trim()) {
      const followUp = await paperAgent.streamText(
        ctx,
        { threadId: agentThreadId },
        {
          system: systemPrompt,
          prompt:
            "Based on all the evidence and source files you have gathered above, now write your response. Do not call any more tools.",
          model: languageModel,
          tools: {},
        } as StreamTextOptions,
        { saveStreamDeltas: true },
      );
      const followUpResponse = await extractAssistantResponse(followUp);
      assistantText = followUpResponse.text;
      thinking = thinking || followUpResponse.thinking;
    }

    if (!assistantText?.trim()) {
      throw new Error("Assistant returned an empty response");
    }

    const citationValidation = await validateAssistantCitations(
      ctx,
      papers,
      assistantText,
    );

    const messageId = await ctx.runMutation(api.messages.addMessage, {
      threadId,
      role: "assistant" as const,
      content: assistantText,
      thinking,
      model: model,
      timestamp: new Date().toISOString(),
    });

    await ctx.runMutation(api.threads.updateSession, {
      id: threadId,
      model: model || undefined,
      updatedAt: new Date().toISOString(),
    });

    if (citationValidation.entries.length > 0) {
      await ctx.runMutation(api.messageCitations.replaceForMessage, {
        messageId,
        entries: citationValidation.entries.map((entry) => ({
          paperId: entry.paperId as Id<"papers">,
          indexVersion: entry.indexVersion,
          refId: entry.refId,
          occurrence: entry.occurrence,
        })),
      });
    }

    return { text: assistantText, messageId: String(messageId) };
  },
});
