import fs from "fs/promises";
import path from "path";
import { paperDir } from "./constants";
import type { Thread, ThreadListItem } from "@/types";

function threadsDir(sanitizedId: string): string {
  return path.join(paperDir(sanitizedId), "threads");
}

function threadPath(sanitizedId: string, threadId: string): string {
  return path.join(threadsDir(sanitizedId), `${threadId}.json`);
}

export async function listThreads(
  sanitizedId: string
): Promise<ThreadListItem[]> {
  const dir = threadsDir(sanitizedId);
  try {
    await fs.mkdir(dir, { recursive: true });
    const files = await fs.readdir(dir);
    const items: ThreadListItem[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(dir, file), "utf-8");
        const thread: Thread = JSON.parse(raw);
        const lastMsg = thread.messages[thread.messages.length - 1];
        items.push({
          id: thread.id,
          title: thread.title,
          updatedAt: thread.updatedAt,
          messageCount: thread.messages.length,
          preview: lastMsg?.content.slice(0, 100),
        });
      } catch {
        // skip malformed files
      }
    }

    items.sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
    return items;
  } catch {
    return [];
  }
}

export async function getThread(
  sanitizedId: string,
  threadId: string
): Promise<Thread | null> {
  try {
    const raw = await fs.readFile(threadPath(sanitizedId, threadId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveThread(
  sanitizedId: string,
  thread: Thread
): Promise<void> {
  const dir = threadsDir(sanitizedId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${thread.id}.json`),
    JSON.stringify(thread, null, 2)
  );
}

export async function deleteThread(
  sanitizedId: string,
  threadId: string
): Promise<void> {
  await fs.unlink(threadPath(sanitizedId, threadId));
}

export function generateThreadTitle(message: string): string {
  const cleaned = message.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 60) return cleaned;
  const truncated = cleaned.slice(0, 60);
  const lastSpace = truncated.lastIndexOf(" ");
  return (lastSpace > 20 ? truncated.slice(0, lastSpace) : truncated) + "…";
}
