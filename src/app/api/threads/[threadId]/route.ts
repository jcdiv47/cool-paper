import { NextResponse } from "next/server";
import { getChatThread, deleteChatThread } from "@/lib/chat-threads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const thread = await getChatThread(threadId);
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
  return NextResponse.json(thread);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  try {
    await deleteChatThread(threadId);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
}
