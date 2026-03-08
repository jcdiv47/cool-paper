import { NextResponse } from "next/server";
import { getPaper, deletePaper } from "@/lib/papers";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const paper = await getPaper(id);
  if (!paper) {
    return NextResponse.json({ error: "Paper not found" }, { status: 404 });
  }
  return NextResponse.json(paper);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deletePaper(id);
  return NextResponse.json({ success: true });
}
