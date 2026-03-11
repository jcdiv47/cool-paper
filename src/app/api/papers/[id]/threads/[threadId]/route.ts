import { NextResponse } from "next/server";
import { getThread, deleteThread } from "@/lib/threads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  const { id, threadId } = await params;
  const thread = await getThread(id, threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; threadId: string }> }
) {
  const { id, threadId } = await params;
  try {
    await deleteThread(id, threadId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
}
