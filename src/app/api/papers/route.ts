import { NextResponse } from "next/server";
import { listPapers, createPaper } from "@/lib/papers";
import { extractArxivId } from "@/lib/constants";

export async function GET() {
  const papers = await listPapers();
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
    const paper = await createPaper(arxivId);
    return NextResponse.json(paper);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to add paper";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
