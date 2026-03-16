import { NextResponse } from "next/server";
import { getPaper } from "@/lib/papers";
import { sanitizeArxivId } from "@/lib/constants";
import { setNoteMeta, getNote } from "@/lib/notes";
import {
  buildAnnotationPromptBlock,
  buildAnnotationValidationError,
  validateAnnotationsForPapers,
} from "@/lib/annotation-links";
import {
  resolveAgentQuery,
  executeAgentQuery,
  extractTextFromMessage,
} from "@/lib/agent";
import { buildCitationValidationError, validateCitationsForPapers } from "@/lib/citation-validation";
import { getConvexClient } from "@/lib/convex-client";
import { ensurePaperEvidenceIndex } from "@/lib/evidence-index";
import { api } from "../../../../convex/_generated/api";
import type { GenerateRequest } from "@/types";

export const dynamic = "force-dynamic";

// In-memory abort controllers keyed by Convex job ID (for cancellation only)
const abortControllers = new Map<string, AbortController>();

export function getAbortController(jobId: string): AbortController | undefined {
  return abortControllers.get(jobId);
}

export function cancelJobByConvexId(jobId: string): boolean {
  const controller = abortControllers.get(jobId);
  if (!controller) return false;
  controller.abort();
  return true;
}

export async function POST(request: Request) {
  const body: GenerateRequest = await request.json();
  const { paperId, prompt, noteFilename, taskType, model } = body;

  const sanitizedId = sanitizeArxivId(paperId);
  const convex = getConvexClient();

  // Check for existing running job in Convex
  const existingJob = await convex.query(api.jobs.getForPaper, {
    sanitizedPaperId: sanitizedId,
  });
  if (existingJob && existingJob.status === "running") {
    return NextResponse.json(
      { error: "Generation already running", convexJobId: existingJob._id },
      { status: 409 }
    );
  }

  const paper = await getPaper(paperId);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }

  await ensurePaperEvidenceIndex(sanitizedId, convex);
  const paperRecord = await convex.query(api.papers.get, { sanitizedId });
  if (!paperRecord) {
    return NextResponse.json({ error: "Paper not found in Convex" }, { status: 404 });
  }
  const paperAnnotations = await convex.query(api.annotations.listByPaper, {
    paperId: paperRecord._id,
  });

  const resolved = resolveAgentQuery({
    paper,
    paperAnnotationsBlock: buildAnnotationPromptBlock(
      paperAnnotations.map((annotation) => ({
        annotationId: String(annotation._id),
        page: annotation.page,
        kind: annotation.kind,
        comment: annotation.comment,
        exact: annotation.exact,
      }))
    ),
    promptInput: prompt,
    noteFilename,
    taskType,
    optionOverrides: model ? { model } : undefined,
  });

  // Create job in Convex
  const convexJobId = await convex.mutation(api.jobs.create, {
    type: "note-generation",
    sanitizedPaperId: sanitizedId,
    paperId,
    noteFilename,
    prompt,
    taskType,
    model,
    displayCommand: resolved.displayCommand,
  });

  // Create abort controller for this job
  const abortController = new AbortController();
  abortControllers.set(convexJobId, abortController);

  let sequenceNumber = 0;

  async function pushEvent(eventType: string, data: Record<string, unknown>) {
    try {
      await convex.mutation(api.jobEvents.push, {
        jobId: convexJobId,
        eventType,
        data: JSON.stringify({ type: eventType, ...data }),
        sequenceNumber: sequenceNumber++,
      });
    } catch (e) {
      console.error("Failed to push event to Convex:", e);
    }
  }

  // Fire-and-forget: run agent detached from request lifecycle
  (async () => {
    try {
      // Push command event
      await pushEvent("command", { command: resolved.displayCommand });

      const messageIterator = executeAgentQuery(resolved, abortController);

      for await (const message of messageIterator) {
        if (message.type === "system" && message.subtype === "init") {
          await pushEvent("stdout", {
            text: `[Session started: model=${message.model}, cwd=${message.cwd}]\n`,
          });
          continue;
        }

        const text = extractTextFromMessage(message);
        if (text) {
          await pushEvent("stdout", { text: text + "\n" });
        }

        if (message.type === "result") {
          const costLine = `\n\n[Completed in ${(message.duration_ms / 1000).toFixed(1)}s, cost: $${message.total_cost_usd.toFixed(4)}]\n`;
          await pushEvent("stdout", { text: costLine });

          setNoteMeta(sanitizedId, noteFilename, {
            model: resolved.options.model,
          }).catch(() => {});

          // Attempt to sync the note to Convex regardless of agent exit status —
          // the agent may have written the file before hitting max turns or erroring.
          try {
            await syncNoteToConvex(sanitizedId, noteFilename, resolved.options.model);

            await pushEvent("done", { exitCode: 0 });
            await convex.mutation(api.jobs.complete, {
              id: convexJobId,
              status: "completed",
            });
          } catch (syncErr) {
            // Sync failed — report the original agent error (if any) plus sync failure
            const agentErrors = "errors" in message && Array.isArray(message.errors)
              ? (message.errors as string[]).join("; ")
              : null;
            const syncErrMsg = syncErr instanceof Error ? syncErr.message : String(syncErr);
            const errorMsg = message.subtype !== "success"
              ? `Agent ${message.subtype}: ${agentErrors ?? "unknown"}. Sync also failed: ${syncErrMsg}`
              : `Sync failed: ${syncErrMsg}`;

            await pushEvent("error", { message: errorMsg });
            await pushEvent("done", { exitCode: 1 });
            await convex.mutation(api.jobs.complete, {
              id: convexJobId,
              status: "failed",
              error: errorMsg,
            });
          }
        }
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error";
      if (errorMessage !== "Aborted") {
        await pushEvent("error", { message: `Agent SDK error: ${errorMessage}` });
      }
      await pushEvent("done", { exitCode: 1 });

      const status = abortController.signal.aborted ? "cancelled" : "failed";
      await convex.mutation(api.jobs.complete, {
        id: convexJobId,
        status: status as "completed" | "failed" | "cancelled",
        ...(status === "failed" ? { error: errorMessage } : {}),
      });
    } finally {
      abortControllers.delete(convexJobId);
    }
  })();

  return NextResponse.json({ convexJobId });
}

async function syncNoteToConvex(
  sanitizedId: string,
  noteFilename: string,
  model?: string
) {
  const content = await getNote(sanitizedId, noteFilename);
  if (!content) {
    throw new Error("Generated note file is empty or missing on disk");
  }

  const convex = getConvexClient();
  const ensuredIndex = await ensurePaperEvidenceIndex(sanitizedId, convex);

  const paper = await convex.query(api.papers.get, { sanitizedId });
  if (!paper) {
    throw new Error(`Paper ${sanitizedId} not found in Convex`);
  }

  const citationValidation = await validateCitationsForPapers(
    convex,
    [
      {
        paperId: paper._id,
        activeIndexVersion:
          paper.activeIndexVersion ?? ensuredIndex.indexVersion,
      },
    ],
    content,
    { requireAtLeastOneCitation: true }
  );

  if (!citationValidation.isValid) {
    throw new Error(buildCitationValidationError(citationValidation));
  }

  const annotationValidation = await validateAnnotationsForPapers(
    convex,
    [paper._id],
    content,
  );

  if (!annotationValidation.isValid) {
    throw new Error(buildAnnotationValidationError(annotationValidation));
  }

  const title = noteFilename.replace(/\.md$/, "").replace(/[-_]/g, " ");
  const now = new Date().toISOString();

  const noteId = await convex.mutation(api.notes.upsert, {
    paperId: paper._id,
    sanitizedPaperId: sanitizedId,
    filename: noteFilename,
    title,
    content,
    model,
    createdAt: now,
    modifiedAt: now,
  });

  await convex.mutation(api.noteCitations.replaceForNote, {
    noteId,
    entries: citationValidation.entries,
  });
}
