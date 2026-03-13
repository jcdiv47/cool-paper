import fs from "fs/promises";
import path from "path";
import { CACHE_BASE_DIR } from "./constants";
import { getPaper } from "./papers";
import { generateThreadTitle } from "./threads";
import type { Thread, ChatThreadListItem } from "@/types";

const THREADS_DIR = path.join(CACHE_BASE_DIR, "threads");

function threadPath(threadId: string): string {
  return path.join(THREADS_DIR, `${threadId}.json`);
}

export async function listChatThreads(): Promise<ChatThreadListItem[]> {
  try {
    await fs.mkdir(THREADS_DIR, { recursive: true });
    const files = await fs.readdir(THREADS_DIR);
    const items: ChatThreadListItem[] = [];

    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      try {
        const raw = await fs.readFile(path.join(THREADS_DIR, file), "utf-8");
        const thread: Thread = JSON.parse(raw);
        const lastMsg = thread.messages[thread.messages.length - 1];

        // Resolve paper titles
        const paperTitles: string[] = [];
        for (const pid of thread.paperIds) {
          const paper = await getPaper(pid);
          paperTitles.push(paper?.title ?? pid);
        }

        // Skip empty threads (no messages sent yet)
        if (thread.messages.length === 0) continue;

        items.push({
          id: thread.id,
          title: thread.title,
          updatedAt: thread.updatedAt,
          messageCount: thread.messages.length,
          preview: lastMsg?.content.slice(0, 100),
          paperIds: thread.paperIds,
          paperTitles,
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

export async function getChatThread(
  threadId: string
): Promise<Thread | null> {
  try {
    const raw = await fs.readFile(threadPath(threadId), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function saveChatThread(thread: Thread): Promise<void> {
  await fs.mkdir(THREADS_DIR, { recursive: true });
  await fs.writeFile(threadPath(thread.id), JSON.stringify(thread, null, 2));
}

export async function deleteChatThread(threadId: string): Promise<void> {
  await fs.unlink(threadPath(threadId));
}

export async function updateThreadPapers(
  threadId: string,
  paperIds: string[]
): Promise<Thread | null> {
  const thread = await getChatThread(threadId);
  if (!thread) return null;
  thread.paperIds = paperIds;
  thread.updatedAt = new Date().toISOString();
  // Clear session since paper context changed
  thread.sessionId = undefined;
  await saveChatThread(thread);
  return thread;
}

export { generateThreadTitle };
