"use client";

import { useEffect, useState } from "react";
import { FileText, NotebookPen, Tag, MessageCircle } from "lucide-react";
import type { PaperMetadata } from "@/types";

interface StatsBlockProps {
  papers: PaperMetadata[];
}

export function StatsBlock({ papers }: StatsBlockProps) {
  const [noteCount, setNoteCount] = useState<number | null>(null);
  const [chatCount, setChatCount] = useState<number | null>(null);

  const paperCount = papers.length;
  const categoryCount = new Set(papers.flatMap((p) => p.categories)).size;

  useEffect(() => {
    let cancelled = false;

    async function fetchNotes() {
      let total = 0;
      await Promise.all(
        papers.map(async (p) => {
          const sanitizedId = p.arxivId.replace(/\//g, "_");
          try {
            const res = await fetch(`/api/papers/${sanitizedId}/notes`);
            const notes: { filename: string }[] = await res.json();
            total += notes.length;
          } catch {}
        })
      );
      if (!cancelled) setNoteCount(total);
    }

    async function fetchChats() {
      try {
        const res = await fetch("/api/threads");
        const threads: unknown[] = await res.json();
        if (!cancelled) setChatCount(threads.length);
      } catch {
        if (!cancelled) setChatCount(0);
      }
    }

    fetchNotes();
    fetchChats();
    return () => {
      cancelled = true;
    };
  }, [papers]);

  const stats = [
    { value: paperCount, label: "Papers", icon: FileText },
    { value: noteCount, label: "Notes", icon: NotebookPen },
    { value: categoryCount, label: "Topics", icon: Tag },
    { value: chatCount, label: "Chats", icon: MessageCircle },
  ];

  return (
    <div className="grid shrink-0 grid-cols-2 gap-x-12 gap-y-4 py-2 sm:w-64 sm:px-6">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="animate-card-enter flex items-center gap-2.5"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <s.icon className="h-5 w-5 shrink-0 text-muted-foreground/60" strokeWidth={1.5} />
          <div className="font-serif text-3xl tabular-nums tracking-tight text-foreground">
            {s.value === null ? (
              <span className="inline-block h-8 w-6 animate-pulse rounded bg-muted/15" />
            ) : (
              s.value
            )}
          </div>
          <div className="text-sm uppercase tracking-widest text-muted-foreground/70">
            {s.label}
          </div>
        </div>
      ))}
    </div>
  );
}
