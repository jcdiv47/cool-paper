import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 6, 50);

  const convex = getConvexClient();
  const notes = await convex.query(api.notes.recentNotes, { limit });

  const result = notes.map((n) => ({
    paperId: n.sanitizedPaperId,
    paperTitle: n.paperTitle,
    filename: n.filename,
    title: n.title,
    modifiedAt: n.modifiedAt,
    model: n.model,
  }));

  return NextResponse.json(result);
}
