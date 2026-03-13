import { NextResponse } from "next/server";
import { updateThreadPapers } from "@/lib/chat-threads";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const { paperIds } = await request.json();

  if (!Array.isArray(paperIds) || paperIds.length === 0) {
    return NextResponse.json(
      { error: "At least one paperId is required" },
      { status: 400 }
    );
  }

  const thread = await updateThreadPapers(threadId, paperIds);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json(thread);
}
