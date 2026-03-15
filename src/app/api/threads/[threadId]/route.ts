import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const convex = getConvexClient();

  const thread = await convex.query(api.threads.get, {
    id: threadId as Id<"threads">,
  });
  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  // Load messages
  const messages = await convex.query(api.messages.listByThread, {
    threadId: threadId as Id<"threads">,
  });

  return NextResponse.json({
    id: thread._id,
    title: thread.title,
    paperIds: thread.paperIds,
    createdAt: thread.createdAt,
    updatedAt: thread.updatedAt,
    sessionId: thread.sessionId,
    model: thread.model,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
      thinking: m.thinking,
      timestamp: m.timestamp,
      model: m.model,
    })),
  });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ threadId: string }> }
) {
  const { threadId } = await params;
  const convex = getConvexClient();

  try {
    await convex.mutation(api.threads.remove, {
      id: threadId as Id<"threads">,
    });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
}
