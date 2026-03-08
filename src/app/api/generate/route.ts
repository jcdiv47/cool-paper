import { NextResponse } from "next/server";
import { getPaper } from "@/lib/papers";
import {
  getAgentQueryConfig,
  startAgentQuery,
  extractTextFromMessage,
} from "@/lib/agent";
import type { GenerateRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body: GenerateRequest = await request.json();
  const { paperId, prompt, noteFilename } = body;

  const paper = await getPaper(paperId);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const config = getAgentQueryConfig(paper, prompt, noteFilename);
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

      send({
        type: "command",
        command: `claude -p '...' --model ${config.model ?? "haiku"} --allowedTools "Read,Write,Glob" [via Agent SDK]`,
      });

      try {
        const messageIterator = startAgentQuery(config, abortController);

        for await (const message of messageIterator) {
          if (message.type === "system" && message.subtype === "init") {
            send({
              type: "stdout",
              text: `[Session started: model=${message.model}, cwd=${message.cwd}]\n`,
            });
            continue;
          }

          const text = extractTextFromMessage(message);
          if (text) {
            send({ type: "stdout", text: text + "\n" });
          }

          if (message.type === "result") {
            if (message.subtype === "success") {
              send({
                type: "stdout",
                text: `\n\n[Completed in ${(message.duration_ms / 1000).toFixed(1)}s, cost: $${message.total_cost_usd.toFixed(4)}]\n`,
              });
              send({ type: "done", exitCode: 0 });
            } else {
              send({
                type: "error",
                message: `Agent error: ${"error" in message ? message.error : "unknown"}`,
              });
              send({ type: "done", exitCode: 1 });
            }
          }
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown error";
        if (errorMessage !== "Aborted") {
          send({ type: "error", message: `Agent SDK error: ${errorMessage}` });
        }
        send({ type: "done", exitCode: 1 });
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
