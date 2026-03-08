import { NextResponse } from "next/server";
import { getNote, deleteNote } from "@/lib/notes";

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
    await deleteNote(id, filename);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
}
