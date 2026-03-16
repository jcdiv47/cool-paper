"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Header } from "@/components/header";
import { FileText, NotebookPen } from "lucide-react";
import { MODEL_OPTIONS } from "@/lib/models";
import type { RecentNote } from "@/types";

export default function NotesListPage() {
  const [search, setSearch] = useState("");

  const convexNotes = useQuery(api.notes.recentNotes, { limit: 50 });
  const loading = convexNotes === undefined;

  const notes: RecentNote[] = (convexNotes ?? []).map((n) => ({
    paperId: n.sanitizedPaperId,
    paperTitle: n.paperTitle,
    filename: n.filename,
    title: n.title,
    modifiedAt: n.modifiedAt,
    model: n.model,
  }));

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
      <Header search={search} onSearchChange={setSearch} searchPlaceholder="Search notes..." pageTitle="Notes" />
      <main className="mx-auto max-w-2xl px-4 py-8 pb-20 sm:px-6 sm:pb-8">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/20" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
            <div className="flex h-14 w-14 items-center justify-center bg-secondary">
              <NotebookPen className="h-6 w-6 text-chart-3" />
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-semibold text-foreground">
                {notes.length === 0 ? "No notes yet" : "No matching notes"}
              </p>
              <p className="text-sm text-muted-foreground">
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
                <div className="group flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3.5 transition-colors duration-200 hover:bg-secondary">
                  <p className="text-sm font-medium leading-tight capitalize transition-colors duration-300 group-hover:text-primary">
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
