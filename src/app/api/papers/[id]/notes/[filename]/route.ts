import { NextResponse } from "next/server";
import { getNote, deleteNote } from "@/lib/notes";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../../../../convex/_generated/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params;
  const content = await getNote(id, filename);
  if (content === null) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  return NextResponse.json({ content });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; filename: string }> }
) {
  const { id, filename } = await params;
  try {
    // Delete from disk
    await deleteNote(id, filename);

    // Delete from Convex
    const convex = getConvexClient();
    await convex.mutation(api.notes.remove, {
      sanitizedPaperId: id,
      filename,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
}
