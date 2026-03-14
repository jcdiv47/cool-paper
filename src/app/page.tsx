"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/header";
import { PaperCard } from "@/components/paper-card";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { StatsBlock } from "@/components/stats-block";
import { AddPaperDialog } from "@/components/add-paper-dialog";
import { PaperPickerDialog } from "@/components/paper-picker-dialog";
import { Button } from "@/components/ui/button";
import { Plus, FileText, NotebookPen, ArrowRight } from "lucide-react";
import { Toaster, toast } from "sonner";
import { removeByPrefix } from "@/lib/cache";
import { MODEL_OPTIONS } from "@/lib/models";
import type { PaperMetadata, NoteFile, RecentNote } from "@/types";

export default function Home() {
  const router = useRouter();
  const [papers, setPapers] = useState<PaperMetadata[]>([]);
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  const fetchPapers = useCallback(async () => {
    try {
      const res = await fetch("/api/papers");
      const data = await res.json();
      setPapers(data);
    } catch {
      toast.error("Failed to load papers");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchRecentNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes?limit=6");
      const data = await res.json();
      setRecentNotes(data);
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    fetchPapers();
    fetchRecentNotes();
  }, [fetchPapers, fetchRecentNotes]);

  // Fetch note counts for the displayed papers
  useEffect(() => {
    if (papers.length === 0) return;
    const displayed = papers.slice(0, 6);
    async function fetchCounts() {
      const counts: Record<string, number> = {};
      for (const paper of displayed) {
        const sanitizedId = paper.arxivId.replace(/\//g, "_");
        try {
          const res = await fetch(`/api/papers/${sanitizedId}/notes`);
          const notes: NoteFile[] = await res.json();
          counts[paper.arxivId] = notes.length;
        } catch {
          counts[paper.arxivId] = 0;
        }
      }
      setNoteCounts(counts);
    }
    fetchCounts();
  }, [papers]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setAddOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleDelete(arxivId: string) {
    const sanitized = arxivId.replace(/\//g, "_");
    try {
      await fetch(`/api/papers/${sanitized}`, { method: "DELETE" });
      removeByPrefix(`paper:meta:${sanitized}`);
      removeByPrefix(`paper:notes:${sanitized}`);
      removeByPrefix(`paper:note:${sanitized}`);
      removeByPrefix(`paper:threads:${sanitized}`);
      setPapers((prev) => prev.filter((p) => p.arxivId !== arxivId));
      toast.success("Paper removed");
    } catch {
      toast.error("Failed to delete paper");
    }
  }

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

  const recentPapers = papers.slice(0, 6);

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="bottom-right" />
      <Header>
        <Button
          size="sm"
          className="ml-auto gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Paper
          <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center rounded border border-primary-foreground/20 bg-primary-foreground/10 px-1 font-mono text-[10px] font-medium opacity-60 sm:inline-flex">
            ⌘K
          </kbd>
        </Button>
      </Header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <div className="h-10 w-full max-w-md animate-pulse rounded-lg bg-muted/20" />
              <div className="h-3 w-24 animate-pulse rounded bg-muted/15" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="animate-card-enter rounded-lg border border-border/20 p-5"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="space-y-2.5">
                    <div className="h-3 w-20 animate-pulse rounded bg-muted/15" />
                    <div className="h-5 w-3/4 animate-pulse rounded bg-muted/20" />
                    <div className="h-3 w-1/2 animate-pulse rounded bg-muted/12" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-full animate-pulse rounded bg-muted/10" />
                      <div className="h-3 w-5/6 animate-pulse rounded bg-muted/10" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-10">
            {/* Stats + Heatmap */}
            {papers.length > 0 && (
              <div className="flex flex-col gap-4 sm:flex-row sm:gap-8">
                <StatsBlock papers={papers} />
                <ActivityHeatmap papers={papers} />
              </div>
            )}

            {/* Recently Added Papers */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-medium text-foreground">
                  Recently Added Papers
                </h2>
                <div className="flex items-center gap-2">
                  {papers.length > 6 && (
                    <Link
                      href="/paper"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
                    >
                      View all
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setAddOpen(true)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Paper
                  </Button>
                </div>
              </div>
              {recentPapers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/40 py-16 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/30" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      Your library is empty
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      Add an arXiv paper to get started
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {recentPapers.map((paper, i) => (
                    <PaperCard
                      key={paper.arxivId}
                      paper={paper}
                      noteCount={noteCounts[paper.arxivId] ?? 0}
                      onDelete={handleDelete}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Recent Notes */}
            <section>
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-medium text-foreground">
                  Recent Notes
                </h2>
                <div className="flex items-center gap-2">
                  {recentNotes.length > 0 && (
                    <Link
                      href="/notes"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground/60 transition-colors hover:text-foreground"
                    >
                      View all
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                  {papers.length > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setNotePickerOpen(true)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Add Note
                    </Button>
                  )}
                </div>
              </div>
              {recentNotes.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/40 py-16 text-center">
                  <NotebookPen className="h-8 w-8 text-muted-foreground/30" />
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-muted-foreground">
                      No notes yet
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      Generate notes from your papers to see them here
                    </p>
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {recentNotes.map((note, i) => (
                    <Link
                      key={`${note.paperId}-${note.filename}`}
                      href={`/paper/${note.paperId}?tab=notes`}
                      className="animate-card-enter block"
                      style={{ animationDelay: `${i * 50}ms` }}
                    >
                      <div className="group flex h-full flex-col gap-1.5 rounded-lg border border-border/40 bg-card/40 px-5 py-3.5 transition-colors duration-200 hover:border-border hover:bg-card/70">
                        <p className="text-sm font-medium leading-snug capitalize">
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
            </section>
          </div>
        )}
      </main>
      <AddPaperDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          fetchPapers();
          fetchRecentNotes();
          toast.success("Paper added successfully");
        }}
      />
      <PaperPickerDialog
        open={notePickerOpen}
        onOpenChange={setNotePickerOpen}
        onSelect={([paperId]) => {
          if (paperId) router.push(`/paper/${paperId}?tab=notes`);
        }}
      />
    </div>
  );
}
