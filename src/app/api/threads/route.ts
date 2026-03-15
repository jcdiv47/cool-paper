import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

export async function GET() {
  const convex = getConvexClient();
  const threads = await convex.query(api.threads.list);
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

  const convex = getConvexClient();
  const now = new Date().toISOString();
  const threadId = await convex.mutation(api.threads.create, {
    title: "New chat",
    paperIds,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ id: threadId, paperIds }, { status: 201 });
}
