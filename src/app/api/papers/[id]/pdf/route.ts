import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { paperDir } from "@/lib/constants";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pdfPath = path.join(paperDir(id), "paper.pdf");

  try {
    const buffer = await fs.readFile(pdfPath);
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return NextResponse.json({ error: "PDF not found" }, { status: 404 });
  }
}
