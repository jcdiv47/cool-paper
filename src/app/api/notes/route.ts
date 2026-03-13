import { NextResponse } from "next/server";
import { listPapers } from "@/lib/papers";
import { listNotes } from "@/lib/notes";
import { sanitizeArxivId } from "@/lib/constants";
import type { RecentNote } from "@/types";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 6, 50);

  const papers = await listPapers();
  const allNotes: RecentNote[] = [];

  for (const paper of papers) {
    const sanitizedId = sanitizeArxivId(paper.arxivId);
    const notes = await listNotes(sanitizedId);
    for (const note of notes) {
      allNotes.push({
        paperId: sanitizedId,
        paperTitle: paper.title,
        filename: note.filename,
        title: note.title,
        modifiedAt: note.modifiedAt,
        model: note.model,
      });
    }
  }

  allNotes.sort(
    (a, b) =>
      new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime()
  );

  return NextResponse.json(allNotes.slice(0, limit));
}
