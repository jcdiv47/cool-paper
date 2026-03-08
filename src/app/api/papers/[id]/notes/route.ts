import { NextResponse } from "next/server";
import { listNotes, searchNotes } from "@/lib/notes";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const notes = q ? await searchNotes(id, q) : await listNotes(id);
  return NextResponse.json(notes);
}
