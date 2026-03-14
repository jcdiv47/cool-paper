import fs from "fs/promises";
import path from "path";
import { paperDir } from "./constants";

export interface GenerationStatus {
  jobId: string;
  status: "running" | "completed" | "failed" | "cancelled";
  noteFilename: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

function statusPath(sanitizedId: string): string {
  return path.join(paperDir(sanitizedId), "notes", ".generation.json");
}

export async function writeGenerationStatus(
  sanitizedId: string,
  status: GenerationStatus
): Promise<void> {
  const filePath = statusPath(sanitizedId);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(status, null, 2));
}

export async function readGenerationStatus(
  sanitizedId: string
): Promise<GenerationStatus | null> {
  try {
    const raw = await fs.readFile(statusPath(sanitizedId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function clearGenerationStatus(
  sanitizedId: string
): Promise<void> {
  try {
    await fs.unlink(statusPath(sanitizedId));
  } catch {
    // File doesn't exist, that's fine
  }
}
