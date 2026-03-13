import { NextResponse } from "next/server";
import { listChatThreads, saveChatThread } from "@/lib/chat-threads";
import type { Thread } from "@/types";

export async function GET() {
  const threads = await listChatThreads();
  return NextResponse.json(threads);
}

export async function POST(request: Request) {
  const { paperIds } = await request.json();

  if (!Array.isArray(paperIds) || paperIds.length === 0) {
    return NextResponse.json(
      { error: "At least one paperId is required" },
      { status: 400 }
    );
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const threadId = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

  const thread: Thread = {
    id: threadId,
    title: "New chat",
    paperIds,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
  };

  await saveChatThread(thread);
  return NextResponse.json(thread, { status: 201 });
}
