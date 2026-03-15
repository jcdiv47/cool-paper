import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";

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

  const convex = getConvexClient();

  try {
    await convex.mutation(api.threads.updatePapers, {
      id: threadId as Id<"threads">,
      paperIds,
    });

    const thread = await convex.query(api.threads.get, {
      id: threadId as Id<"threads">,
    });

    return NextResponse.json(thread);
  } catch {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }
}
