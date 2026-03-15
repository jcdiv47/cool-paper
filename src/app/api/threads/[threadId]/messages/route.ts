import { NextResponse } from "next/server";
import { getPaper } from "@/lib/papers";
import {
  resolveAgentQuery,
  executeAgentQuery,
  extractTextDelta,
  extractThinkingDelta,
} from "@/lib/agent";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import type { ResolvedAgentQuery } from "@/lib/agent";
import type { PaperMetadata, ThreadMessage } from "@/types";

export const dynamic = "force-dynamic";

function generateThreadTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const truncated = cleaned.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "\u2026";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { message, model } = await request.json();

  const convex = getConvexClient();

  // Load thread from Convex
  const thread = await convex.query(api.threads.get, {
    id: threadId as Id<"threads">,
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Load messages from Convex
  const existingMessages = await convex.query(api.messages.listByThread, {
    threadId: threadId as Id<"threads">,
  });

  // Load all papers for this thread
  const papers: PaperMetadata[] = [];
  for (const pid of thread.paperIds) {
    const paper = await getPaper(pid);
    if (paper) papers.push(paper);
  }

  if (papers.length === 0) {
    return NextResponse.json({ error: "No valid papers found" }, { status: 404 });
  }

  // Update title on first user message
  const userMessages = existingMessages.filter((m) => m.role === "user");
  if (userMessages.length <= 1) {
    await convex.mutation(api.threads.updateTitle, {
      id: threadId as Id<"threads">,
      title: generateThreadTitle(message),
    });
  }

  // Build conversation history (all messages except the latest user one — already added by the client)
  const history: ThreadMessage[] = existingMessages
    .filter((m) => !m.isPartial)
    .slice(0, -1) // Exclude the just-added user message
    .map((m) => ({
      role: m.role,
      content: m.content,
      thinking: m.thinking,
      timestamp: m.timestamp,
      model: m.model,
    }));

  // If model changed from the thread's stored model, don't resume the old session
  const modelChanged = model && model !== thread.model;
  const resolved = resolveAgentQuery({
    paper: papers[0]!,
    papers: papers.length > 1 ? papers : undefined,
    promptInput: message,
    noteFilename: "",
    taskType: "conversation",
    conversationHistory: history.length > 0 ? history : undefined,
    optionOverrides: {
      ...(model ? { model } : {}),
      ...(thread.sessionId && !modelChanged
        ? { resume: thread.sessionId, sessionId: thread.sessionId }
        : {}),
    },
  });

  const abortController = new AbortController();
  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  // Run the agent and batch partial updates to Convex
  async function runQuery(query: ResolvedAgentQuery) {
    let assistantText = "";
    let thinkingText = "";
    let sessionId: string | undefined;
    let lastFlush = Date.now();

    async function flushPartial() {
      if (!assistantText && !thinkingText) return;
      await convex.mutation(api.messages.upsertPartial, {
        threadId: threadId as Id<"threads">,
        content: assistantText,
        thinking: thinkingText || undefined,
        model: query.options.model,
        timestamp: new Date().toISOString(),
      });
      lastFlush = Date.now();
    }

    const messageIterator = executeAgentQuery(query, abortController);

    for await (const msg of messageIterator) {
      if (msg.type === "system" && msg.subtype === "init") {
        sessionId = msg.session_id;
        continue;
      }

      const thinkingDelta = extractThinkingDelta(msg);
      if (thinkingDelta) {
        thinkingText += thinkingDelta;
        if (Date.now() - lastFlush >= 200) {
          await flushPartial();
        }
        continue;
      }

      const delta = extractTextDelta(msg);
      if (delta) {
        assistantText += delta;
        if (Date.now() - lastFlush >= 200) {
          await flushPartial();
        }
        continue;
      }

      if (msg.type === "result") {
        if (msg.subtype === "success") {
          sessionId = sessionId || msg.session_id;
        }
      }
    }

    // Final flush
    await flushPartial();

    return { assistantText, thinkingText, sessionId };
  }

  try {
    let result;
    try {
      result = await runQuery(resolved);
    } catch (err) {
      if (resolved.options.resume) {
        // Retry without session resume
        const freshQuery: ResolvedAgentQuery = {
          ...resolved,
          options: {
            ...resolved.options,
            resume: undefined,
            sessionId: undefined,
          },
        };
        result = await runQuery(freshQuery);
      } else {
        throw err;
      }
    }

    // Finalize the partial message
    if (result.assistantText) {
      await convex.mutation(api.messages.finalizePartial, {
        threadId: threadId as Id<"threads">,
        content: result.assistantText,
        thinking: result.thinkingText || undefined,
        model: resolved.options.model,
        timestamp: new Date().toISOString(),
      });
    }

    // Update thread session
    await convex.mutation(api.threads.updateSession, {
      id: threadId as Id<"threads">,
      sessionId: result.sessionId,
      model: model || undefined,
      updatedAt: new Date().toISOString(),
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error";

    // Clean up any partial message
    if (errorMessage === "Aborted") {
      // Remove the half-written partial so it doesn't persist
      await convex.mutation(api.messages.deletePartial, {
        threadId: threadId as Id<"threads">,
      });
    } else {
      // Finalize with error state
      await convex.mutation(api.messages.finalizePartial, {
        threadId: threadId as Id<"threads">,
        content: `[Error: ${errorMessage}]`,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
