import { NextResponse } from "next/server";
import { sanitizeArxivId } from "@/lib/constants";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../../../../convex/_generated/api";
import { cancelJobByConvexId, getAbortController } from "@/app/api/generate/route";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sanitizedId = sanitizeArxivId(id);
  const convex = getConvexClient();

  const job = await convex.query(api.jobs.getForPaper, {
    sanitizedPaperId: sanitizedId,
  });

  if (!job) {
    return NextResponse.json({ active: false });
  }

  // Detect orphaned jobs: still "running" in Convex but no in-memory abort
  // controller (server restarted while the job was in progress)
  if (job.status === "running" && !getAbortController(job._id)) {
    await convex.mutation(api.jobs.complete, {
      id: job._id,
      status: "failed",
      error: "Job process lost (server restart)",
    });
    return NextResponse.json({
      active: false,
      convexJobId: job._id,
      status: "failed",
      noteFilename: job.noteFilename,
    });
  }

  return NextResponse.json({
    active: job.status === "running",
    convexJobId: job._id,
    status: job.status,
    noteFilename: job.noteFilename,
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sanitizedId = sanitizeArxivId(id);
  const convex = getConvexClient();

  const job = await convex.query(api.jobs.getForPaper, {
    sanitizedPaperId: sanitizedId,
  });

  if (!job || job.status !== "running") {
    return NextResponse.json(
      { error: "No running job to cancel" },
      { status: 404 }
    );
  }

  // Cancel in-memory abort controller
  cancelJobByConvexId(job._id);

  // Mark cancelled in Convex
  await convex.mutation(api.jobs.cancel, { id: job._id });

  return NextResponse.json({ cancelled: true });
}
