"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Header } from "@/components/header";
import { FileText, NotebookPen } from "lucide-react";
import { MODEL_OPTIONS } from "@/lib/models";
import type { RecentNote } from "@/types";

export default function NotesListPage() {
  const [notes, setNotes] = useState<RecentNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes?limit=50");
      const data = await res.json();
      setNotes(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotes();
  }, [fetchNotes]);

  function timeAgo(dateStr: string): string {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const seconds = Math.floor((now - then) / 1000);
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  }

  const filtered = search.trim()
    ? notes.filter((n) => {
        const q = search.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.paperTitle.toLowerCase().includes(q)
        );
      })
    : notes;

  return (
    <div className="min-h-screen bg-background">
      <Header search={search} onSearchChange={setSearch} searchPlaceholder="Search notes...">
        <span className="text-sm font-medium">Notes</span>
        <div className="flex-1" />
      </Header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/20" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
            <NotebookPen className="h-10 w-10 text-muted-foreground/30" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">
                {notes.length === 0 ? "No notes yet" : "No matching notes"}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {notes.length === 0
                  ? "Generate notes from your papers to see them here"
                  : "Try a different search term"}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((note, i) => (
              <Link
                key={`${note.paperId}-${note.filename}`}
                href={`/paper/${note.paperId}?tab=notes`}
                className="animate-card-enter block"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="group flex flex-col gap-1.5 rounded-xl border border-border/30 px-4 py-3 transition-colors duration-200 hover:border-border/60 hover:bg-muted/20">
                  <p className="text-sm font-medium leading-tight capitalize">
                    {note.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                    <FileText className="h-3 w-3 shrink-0" />
                    <span className="truncate">{note.paperTitle}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground/40">
                    <span>{timeAgo(note.modifiedAt)}</span>
                    {note.model && (
                      <>
                        <span>·</span>
                        <span>
                          {MODEL_OPTIONS.find((m) => m.id === note.model)?.label ?? note.model}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
