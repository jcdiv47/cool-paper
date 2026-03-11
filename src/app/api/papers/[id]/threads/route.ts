import { NextResponse } from "next/server";
import { listThreads } from "@/lib/threads";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const threads = await listThreads(id);
  return NextResponse.json(threads);
}
