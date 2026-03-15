import { NextResponse } from "next/server";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../../../convex/_generated/api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const convex = getConvexClient();

  const notes = q
    ? await convex.query(api.notes.search, { sanitizedPaperId: id, query: q })
    : await convex.query(api.notes.listByPaper, { sanitizedPaperId: id });

  const result = notes.map((n) => ({
    filename: n.filename,
    title: n.title,
    modifiedAt: n.modifiedAt,
    model: n.model,
    ...("snippet" in n ? { snippet: (n as { snippet?: string }).snippet } : {}),
  }));

  return NextResponse.json(result);
}
