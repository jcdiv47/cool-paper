"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { FileText, Tag, MessageCircle } from "lucide-react";
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

  const stats = [
    { value: paperCount, label: "Papers", icon: FileText, color: "text-primary" },
    { value: categoryCount, label: "Topics", icon: Tag, color: "text-chart-2" },
    { value: chatCount, label: "Chats", icon: MessageCircle, color: "text-chart-4" },
  ];

  return (
    <div className="grid shrink-0 grid-cols-3 gap-3 sm:w-72">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="animate-card-enter flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className={`rounded-lg bg-secondary p-1.5 ${s.color}`}>
            <s.icon className="h-4 w-4" strokeWidth={1.8} />
          </div>
          <div>
            <div className="font-serif text-2xl font-semibold tabular-nums tracking-tight text-primary">
              {s.value === null ? (
                <span className="inline-block h-7 w-5 animate-shimmer rounded" />
              ) : (
                s.value
              )}
            </div>
            <div className="text-[11px] font-medium text-muted-foreground/60">
              {s.label}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
