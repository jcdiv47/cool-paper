import { NextResponse } from "next/server";
import { createPaper } from "@/lib/papers";
import { extractArxivId, sanitizeArxivId } from "@/lib/constants";
import { getConvexClient } from "@/lib/convex-client";
import { api } from "../../../../convex/_generated/api";

export async function GET() {
  // Papers are now read from Convex on the client side via useQuery.
  // This endpoint is kept for backward compatibility but proxies to Convex.
  const convex = getConvexClient();
  const papers = await convex.query(api.papers.list);
  return NextResponse.json(papers);
}

export async function POST(request: Request) {
  const { input } = await request.json();
  const arxivId = extractArxivId(input);

  if (!arxivId) {
    return NextResponse.json(
      { error: "Invalid arxiv ID or URL" },
      { status: 400 }
    );
  }

  try {
    // Download files to disk (PDF, source, metadata)
    const paper = await createPaper(arxivId);

    // Also write to Convex
    const convex = getConvexClient();
    await convex.mutation(api.papers.create, {
      arxivId: paper.arxivId,
      sanitizedId: sanitizeArxivId(paper.arxivId),
      title: paper.title,
      authors: paper.authors,
      abstract: paper.abstract,
      published: paper.published,
      categories: paper.categories,
      addedAt: paper.addedAt,
    });

    return NextResponse.json(paper);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add paper";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
