import { NextResponse } from "next/server";
import { getPaper, deletePaper } from "@/lib/papers";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../../convex/_generated/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const paper = await getPaper(id);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }
  return NextResponse.json(paper);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Delete from disk
  await deletePaper(id);

  // Delete from Convex (cascade deletes notes, jobs, events)
  const convex = getConvexClient();
  await convex.mutation(api.papers.removeBySanitizedId, { sanitizedId: id });

  return NextResponse.json({ success: true });
}
