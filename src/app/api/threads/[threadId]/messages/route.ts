import { NextResponse } from "next/server";
import { getPaper } from "@/lib/papers";
import { getChatThread, saveChatThread, generateThreadTitle } from "@/lib/chat-threads";
import {
  resolveAgentQuery,
  executeAgentQuery,
  extractTextDelta,
  extractThinkingDelta,
} from "@/lib/agent";
import type { ResolvedAgentQuery } from "@/lib/agent";
import type { ThreadMessage } from "@/types";
import type { PaperMetadata } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { message, model } = await request.json();

  // Load thread
  let thread = await getChatThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Load all papers for this thread
  const papers: PaperMetadata[] = [];
  for (const pid of thread.paperIds) {
    const paper = await getPaper(pid);
    if (paper) papers.push(paper);
  }

  if (papers.length === 0) {
    return NextResponse.json({ error: "No valid papers found" }, { status: 404 });
  }

  // Append user message
  const userMessage: ThreadMessage = {
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  };
  thread.messages.push(userMessage);
  thread.updatedAt = userMessage.timestamp;

  // Update title on first message
  if (thread.messages.length === 1) {
    thread.title = generateThreadTitle(message);
  }

  // Save immediately so user message is persisted even if streaming fails
  await saveChatThread(thread);

  // Build conversation history (all messages except the latest user one)
  const history = thread.messages.slice(0, -1);

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

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      function send(data: Record<string, unknown>) {
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // Controller closed
        }
      }

      async function runQuery(query: ResolvedAgentQuery) {
        let assistantText = "";
        let thinkingText = "";
        let thinkingDone = false;
        let sessionId: string | undefined;

        const messageIterator = executeAgentQuery(query, abortController);

        for await (const msg of messageIterator) {
          if (msg.type === "system" && msg.subtype === "init") {
            sessionId = msg.session_id;
            continue;
          }

          const thinkingDelta = extractThinkingDelta(msg);
          if (thinkingDelta) {
            thinkingText += thinkingDelta;
            send({ type: "thinking_delta", thinking: thinkingDelta });
            continue;
          }

          const delta = extractTextDelta(msg);
          if (delta) {
            if (!thinkingDone) {
              thinkingDone = true;
              send({ type: "thinking_done" });
            }
            assistantText += delta;
            send({ type: "text_delta", text: delta });
            continue;
          }

          if (msg.type === "result") {
            if (msg.subtype === "success") {
              sessionId = sessionId || msg.session_id;
            }
          }
        }

        return { assistantText, thinkingText, sessionId };
      }

      try {
        let result;
        try {
          result = await runQuery(resolved);
        } catch (err) {
          if (resolved.options.resume) {
            const freshQuery: ResolvedAgentQuery = {
              ...resolved,
              options: {
                ...resolved.options,
                resume: undefined,
                sessionId: undefined,
              },
            };
            thread!.sessionId = undefined;
            result = await runQuery(freshQuery);
          } else {
            throw err;
          }
        }

        if (model) thread!.model = model;

        if (result.assistantText) {
          const assistantMessage: ThreadMessage = {
            role: "assistant",
            content: result.assistantText,
            ...(result.thinkingText ? { thinking: result.thinkingText } : {}),
            timestamp: new Date().toISOString(),
            model: resolved.options.model,
          };
          thread!.messages.push(assistantMessage);
          thread!.updatedAt = assistantMessage.timestamp;
        }
        if (result.sessionId) {
          thread!.sessionId = result.sessionId;
        }
        await saveChatThread(thread!);

        send({ type: "message_done", sessionId: result.sessionId || null });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        if (errorMessage !== "Aborted") {
          send({ type: "error", message: errorMessage });
        }
        await saveChatThread(thread!);
      } finally {
        controller.close();
      }
    },
  });

  request.signal.addEventListener("abort", () => {
    abortController.abort();
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
