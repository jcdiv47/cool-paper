"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { PaperMetadata } from "@/types";

const CACHE_KEY = "stats-block-cache";

interface CachedStats {
  chatCount: number;
  timestamp: number;
}

function readCache(): CachedStats | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(stats: CachedStats) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(stats));
  } catch {
    // localStorage unavailable
  }
}

interface StatsBlockProps {
  papers: PaperMetadata[];
}

export function StatsBlock({ papers }: StatsBlockProps) {
  const cached = readCache();

  const threads = useQuery(api.threads.list);

  const [chatCount, setChatCount] = useState<number | null>(cached?.chatCount ?? null);

  const paperCount = papers.length;
  const categoryCount = new Set(papers.flatMap((p) => p.categories)).size;

  useEffect(() => {
    if (threads !== undefined) {
      setChatCount(threads.length);
    }
  }, [threads]);

  // Persist to localStorage when loaded
  useEffect(() => {
    if (chatCount !== null) {
      writeCache({ chatCount, timestamp: Date.now() });
    }
  }, [chatCount]);

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/30 px-3 py-1">
        <span className="font-semibold text-foreground">{paperCount}</span> paper{paperCount !== 1 ? "s" : ""}
      </span>
      <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/30 px-3 py-1">
        <span className="font-semibold text-foreground">{categoryCount}</span> topic{categoryCount !== 1 ? "s" : ""}
      </span>
      {chatCount !== null && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-muted/30 px-3 py-1">
          <span className="font-semibold text-foreground">{chatCount}</span> chat{chatCount !== 1 ? "s" : ""}
        </span>
      )}
    </div>
  );
}
