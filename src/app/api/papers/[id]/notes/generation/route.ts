import { NextResponse } from "next/server";
import { sanitizeArxivId } from "@/lib/constants";
import { getJob, addListener, cancelJob } from "@/lib/job-store";
import {
  readGenerationStatus,
  writeGenerationStatus,
} from "@/lib/generation-status";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sanitizedId = sanitizeArxivId(id);
  const url = new URL(request.url);
  const isStream = url.searchParams.has("stream");

  if (!isStream) {
    // JSON status check
    const job = getJob(sanitizedId);
    if (job) {
      return NextResponse.json({
        active: job.status === "running",
        jobId: job.jobId,
        status: job.status,
        noteFilename: job.noteFilename,
      });
    }

    // Fall back to disk status
    const diskStatus = await readGenerationStatus(sanitizedId);
    if (diskStatus) {
      if (diskStatus.status === "running") {
        // Orphaned: server restarted while generation was running
        const updated = { ...diskStatus, status: "failed" as const, completedAt: new Date().toISOString(), error: "Server restarted" };
        await writeGenerationStatus(sanitizedId, updated);
        return NextResponse.json({
          active: false,
          jobId: diskStatus.jobId,
          status: "failed",
          noteFilename: diskStatus.noteFilename,
        });
      }
      return NextResponse.json({
        active: false,
        jobId: diskStatus.jobId,
        status: diskStatus.status,
        noteFilename: diskStatus.noteFilename,
      });
    }

    return NextResponse.json({ active: false });
  }

  // SSE stream mode
  const job = getJob(sanitizedId);
  if (!job) {
    return NextResponse.json({ error: "No active job" }, { status: 404 });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      function send(data: Record<string, unknown>, eventId?: number) {
        try {
          let msg = "";
          if (eventId !== undefined) {
            msg += `id: ${eventId}\n`;
          }
          msg += `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(msg));
        } catch {
          // Controller closed
        }
      }

      // Replay buffered events
      for (const event of job.events) {
        send(event.data, event.id);
      }

      // If job is already done, close the stream
      if (job.status !== "running") {
        controller.close();
        return;
      }

      // Register for live events
      const unsubscribe = addListener(sanitizedId, (event) => {
        send(event.data, event.id);
        if (event.data.type === "done") {
          try {
            controller.close();
          } catch {
            // Already closed
          }
        }
      });

      // Clean up when client disconnects (do NOT cancel the agent)
      request.signal.addEventListener("abort", () => {
        if (unsubscribe) unsubscribe();
        try {
          controller.close();
        } catch {
          // Already closed
        }
      });
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sanitizedId = sanitizeArxivId(id);

  const cancelled = cancelJob(sanitizedId);
  if (!cancelled) {
    return NextResponse.json(
      { error: "No running job to cancel" },
      { status: 404 }
    );
  }

  // The agent's catch block will handle status updates via completeJob/writeGenerationStatus
  return NextResponse.json({ cancelled: true });
}
