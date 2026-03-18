/**
 * One-time sync script: reads local .cache data and inserts into Convex.
 *
 * Usage: npx tsx scripts/sync-to-convex.ts
 */

import fs from "fs/promises";
import path from "path";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!CONVEX_URL) {
  console.error("NEXT_PUBLIC_CONVEX_URL not set");
  process.exit(1);
}

const client = new ConvexHttpClient(CONVEX_URL);
const CACHE_DIR = path.join(process.cwd(), ".cache", "papers");
const THREADS_DIR = path.join(process.cwd(), ".cache", "threads");

function sanitizeArxivId(id: string): string {
  return id.replace(/\//g, "_");
}

async function syncPapers() {
  console.log("Syncing papers...");
  let dirs: string[];
  try {
    const entries = await fs.readdir(CACHE_DIR, { withFileTypes: true });
    dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    console.log("No papers directory found, skipping.");
    return;
  }

  let count = 0;
  for (const dir of dirs) {
    const metaPath = path.join(CACHE_DIR, dir, "metadata.json");
    try {
      const raw = await fs.readFile(metaPath, "utf-8");
      const meta = JSON.parse(raw);
      const sanitizedId = sanitizeArxivId(meta.arxivId);
      await client.mutation(api.papers.create, {
        arxivId: meta.arxivId,
        sanitizedId,
        title: meta.title,
        authors: meta.authors ?? [],
        abstract: meta.abstract ?? "",
        published: meta.published ?? "",
        categories: meta.categories ?? [],
        addedAt: meta.addedAt ?? new Date().toISOString(),
      });
      count++;
      console.log(`  Paper: ${meta.title.slice(0, 60)}...`);
    } catch (e) {
      console.warn(`  Skipping ${dir}: ${e}`);
    }
  }

  console.log(`Synced ${count} papers.`);
}

async function syncThreads() {
  console.log("Syncing global threads...");
  let count = 0;

  let files: string[];
  try {
    const entries = await fs.readdir(THREADS_DIR);
    files = entries.filter((f) => f.endsWith(".json"));
  } catch {
    console.log("No threads directory found, skipping.");
    return;
  }

  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(THREADS_DIR, file), "utf-8");
      const thread = JSON.parse(raw);

      const threadId = await client.mutation(api.threads.create, {
        title: thread.title ?? "Untitled",
        paperIds: thread.paperIds ?? [],
        model: thread.model ?? undefined,
        sessionId: thread.sessionId ?? undefined,
        createdAt: thread.createdAt ?? new Date().toISOString(),
        updatedAt: thread.updatedAt ?? new Date().toISOString(),
      });

      // Insert messages
      if (Array.isArray(thread.messages)) {
        for (const msg of thread.messages) {
          await client.mutation(api.messages.addMessage, {
            threadId,
            role: msg.role,
            content: msg.content ?? "",
            thinking: msg.thinking ?? undefined,
            model: msg.model ?? undefined,
            timestamp: msg.timestamp ?? new Date().toISOString(),
          });
        }
      }

      count++;
      console.log(`  Thread: ${thread.title?.slice(0, 60) ?? file}`);
    } catch (e) {
      console.warn(`  Skipping thread ${file}: ${e}`);
    }
  }

  console.log(`Synced ${count} threads.`);
}

async function main() {
  console.log("Starting sync to Convex...\n");
  await syncPapers();
  await syncThreads();
  console.log("\nSync complete!");
}

main().catch((e) => {
  console.error("Sync failed:", e);
  process.exit(1);
});
