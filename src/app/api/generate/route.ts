import { NextResponse } from "next/server";
import { getPaper } from "@/lib/papers";
import { sanitizeArxivId } from "@/lib/constants";
import { setNoteMeta } from "@/lib/notes";
import {
  resolveAgentQuery,
  executeAgentQuery,
  extractTextFromMessage,
} from "@/lib/agent";
import { createJob, pushEvent, completeJob, getJob } from "@/lib/job-store";
import { writeGenerationStatus } from "@/lib/generation-status";
import type { GenerateRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body: GenerateRequest = await request.json();
  const { paperId, prompt, noteFilename, taskType, model } = body;

  const sanitizedId = sanitizeArxivId(paperId);

  // Check for existing running job
  const existing = getJob(sanitizedId);
  if (existing && existing.status === "running") {
    return NextResponse.json(
      { error: "Generation already running", jobId: existing.jobId },
      { status: 409 }
    );
  }

  const paper = await getPaper(paperId);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  const resolved = resolveAgentQuery({
    paper,
    promptInput: prompt,
    noteFilename,
    taskType,
    optionOverrides: model ? { model } : undefined,
  });

  const job = createJob(sanitizedId, paperId, noteFilename);

  // Write disk status
  await writeGenerationStatus(sanitizedId, {
    jobId: job.jobId,
    status: "running",
    noteFilename,
    startedAt: new Date().toISOString(),
  });

  // Push command event immediately
  pushEvent(sanitizedId, {
    type: "command",
    command: resolved.displayCommand,
  });

  // Fire-and-forget: run agent detached from request lifecycle
  (async () => {
    try {
      const messageIterator = executeAgentQuery(resolved, job.abortController);

      for await (const message of messageIterator) {
        if (message.type === "system" && message.subtype === "init") {
          pushEvent(sanitizedId, {
            type: "stdout",
            text: `[Session started: model=${message.model}, cwd=${message.cwd}]\n`,
          });
          continue;
        }

        const text = extractTextFromMessage(message);
        if (text) {
          pushEvent(sanitizedId, { type: "stdout", text: text + "\n" });
        }

        if (message.type === "result") {
          if (message.subtype === "success") {
            pushEvent(sanitizedId, {
              type: "stdout",
              text: `\n\n[Completed in ${(message.duration_ms / 1000).toFixed(1)}s, cost: $${message.total_cost_usd.toFixed(4)}]\n`,
            });
            setNoteMeta(sanitizedId, noteFilename, {
              model: resolved.options.model,
            }).catch(() => {});
            pushEvent(sanitizedId, { type: "done", exitCode: 0 });
            completeJob(sanitizedId, "completed");
            await writeGenerationStatus(sanitizedId, {
              jobId: job.jobId,
              status: "completed",
              noteFilename,
              startedAt: job.events[0]?.timestamp
                ? new Date(job.events[0].timestamp).toISOString()
                : new Date().toISOString(),
              completedAt: new Date().toISOString(),
            });
          } else {
            const errorMsg = `Agent error: ${"error" in message ? message.error : "unknown"}`;
            pushEvent(sanitizedId, { type: "error", message: errorMsg });
            pushEvent(sanitizedId, { type: "done", exitCode: 1 });
            completeJob(sanitizedId, "failed");
            await writeGenerationStatus(sanitizedId, {
              jobId: job.jobId,
              status: "failed",
              noteFilename,
              startedAt: new Date().toISOString(),
              completedAt: new Date().toISOString(),
              error: errorMsg,
            });
          }
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      if (errorMessage !== "Aborted") {
        pushEvent(sanitizedId, {
          type: "error",
          message: `Agent SDK error: ${errorMessage}`,
        });
      }
      pushEvent(sanitizedId, { type: "done", exitCode: 1 });

      const status = job.abortController.signal.aborted ? "cancelled" : "failed";
      completeJob(sanitizedId, status);
      await writeGenerationStatus(sanitizedId, {
        jobId: job.jobId,
        status,
        noteFilename,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        ...(status === "failed" ? { error: errorMessage } : {}),
      });
    }
  })();

  return NextResponse.json({ jobId: job.jobId });
}
