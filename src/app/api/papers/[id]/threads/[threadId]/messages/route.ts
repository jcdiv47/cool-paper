import { NextResponse } from "next/server";
import { getPaper } from "@/lib/papers";
import { getThread, saveThread, generateThreadTitle } from "@/lib/threads";
import {
  resolveAgentQuery,
  executeAgentQuery,
  extractTextDelta,
  extractThinkingDelta,
} from "@/lib/agent";
import type { ResolvedAgentQuery } from "@/lib/agent";
import type { Thread, ThreadMessage } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  const { id, threadId } = await params;
  const { message, model } = await request.json();

  const paper = await getPaper(id);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  // Load or create thread
  let thread = await getThread(id, threadId);

  if (!thread) {
    thread = {
      id: threadId,
      title: generateThreadTitle(message),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: [],
    };
  }

  // Append user message
  const userMessage: ThreadMessage = {
    role: "user",
    content: message,
    timestamp: new Date().toISOString(),
  };
  thread.messages.push(userMessage);
  thread.updatedAt = userMessage.timestamp;

  // Save immediately so user message is persisted even if streaming fails
  await saveThread(id, thread);

  // Build conversation history (all messages except the latest user one — that goes in the prompt)
  const history = thread.messages.slice(0, -1);

  // If model changed from the thread's stored model, don't resume the old session
  const modelChanged = model && model !== thread.model;
  const resolved = resolveAgentQuery({
    paper,
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

          // Thinking deltas (extended thinking)
          const thinkingDelta = extractThinkingDelta(msg);
          if (thinkingDelta) {
            thinkingText += thinkingDelta;
            send({ type: "thinking_delta", thinking: thinkingDelta });
            continue;
          }

          // Token-level streaming from stream_event messages
          const delta = extractTextDelta(msg);
          if (delta) {
            // Signal transition from thinking to text on first text delta
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
          // If resume failed (stale session), retry without resume
          if (resolved.options.resume) {
            const freshQuery: ResolvedAgentQuery = {
              ...resolved,
              options: {
                ...resolved.options,
                resume: undefined,
                sessionId: undefined,
              },
            };
            // Clear stale sessionId from thread
            thread!.sessionId = undefined;
            result = await runQuery(freshQuery);
          } else {
            throw err;
          }
        }

        // Persist model on the thread
        if (model) thread!.model = model;

        // Append assistant message and save
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
        await saveThread(id, thread!);

        send({ type: "message_done", sessionId: result.sessionId || null });
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        if (errorMessage !== "Aborted") {
          send({ type: "error", message: errorMessage });
        }
        // Save thread state (user message already saved)
        await saveThread(id, thread!);
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
