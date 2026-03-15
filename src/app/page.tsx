"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Header } from "@/components/header";
import { PaperCard } from "@/components/paper-card";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { StatsBlock } from "@/components/stats-block";
import { AddPaperDialog } from "@/components/add-paper-dialog";
import { PaperPickerDialog } from "@/components/paper-picker-dialog";
import { Button } from "@/components/ui/button";
import { Plus, FileText, NotebookPen, ArrowRight, Sparkles } from "lucide-react";
import { Toaster, toast } from "sonner";
import { MODEL_OPTIONS } from "@/lib/models";
import type { PaperMetadata, RecentNote } from "@/types";

export default function Home() {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [notePickerOpen, setNotePickerOpen] = useState(false);

  const convexPapers = useQuery(api.papers.list);
  const loading = convexPapers === undefined;

  const papers: PaperMetadata[] = (convexPapers ?? []).map((p) => ({
    arxivId: p.arxivId,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract,
    published: p.published,
    categories: p.categories,
    addedAt: p.addedAt,
  }));

  const convexRecentNotes = useQuery(api.notes.recentNotes, { limit: 6 });
  const recentNotes: RecentNote[] = (convexRecentNotes ?? []).map((n) => ({
    paperId: n.sanitizedPaperId,
    paperTitle: n.paperTitle,
    filename: n.filename,
    title: n.title,
    modifiedAt: n.modifiedAt,
    model: n.model,
  }));

  const convexAllNotes = useQuery(api.notes.countByPapers);
  const noteCounts: Record<string, number> = convexAllNotes ?? {};

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

  const handlePaperAdded = useCallback(() => {
    toast.success("Paper added successfully");
  }, []);

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
      <main className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
        {loading ? (
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="h-10 w-full max-w-md animate-shimmer rounded-lg" />
              <div className="h-3 w-24 animate-shimmer rounded" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="animate-card-enter rounded-xl border border-border/20 p-5"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="space-y-3">
                    <div className="h-3 w-20 animate-shimmer rounded" />
                    <div className="h-5 w-3/4 animate-shimmer rounded" />
                    <div className="h-3 w-1/2 animate-shimmer rounded" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-full animate-shimmer rounded" />
                      <div className="h-3 w-5/6 animate-shimmer rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-14">
            {/* Stats + Heatmap */}
            {papers.length > 0 && (
              <div className="flex flex-col gap-6 sm:flex-row sm:gap-8">
                <StatsBlock papers={papers} />
                <ActivityHeatmap papers={papers} />
              </div>
            )}

            {/* Recently Added Papers */}
            <section>
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
                    Recent Papers
                  </h2>
                  {papers.length > 0 && (
                    <span className="bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                      {papers.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {papers.length > 6 && (
                    <Link
                      href="/paper"
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
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
                <div className="flex flex-col items-center justify-center gap-6 rounded-xl border border-border bg-card py-24 text-center">
                  <div className="flex h-16 w-16 items-center justify-center bg-primary/10">
                    <Sparkles className="h-7 w-7 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-serif text-lg font-semibold text-foreground">
                      Your library is empty
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Add an arXiv paper to start building your collection
                    </p>
                  </div>
                  <Button onClick={() => setAddOpen(true)} className="gap-1.5">
                    <Plus className="h-4 w-4" />
                    Add Your First Paper
                  </Button>
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
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h2 className="font-serif text-xl font-semibold tracking-tight text-foreground">
                    Recent Notes
                  </h2>
                  {recentNotes.length > 0 && (
                    <span className="bg-chart-3/10 px-2.5 py-0.5 text-[11px] font-semibold text-chart-3">
                      {recentNotes.length}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {recentNotes.length > 0 && (
                    <Link
                      href="/notes"
                      className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary"
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
                <div className="flex flex-col items-center justify-center gap-6 rounded-xl border border-border bg-card py-24 text-center">
                  <div className="flex h-16 w-16 items-center justify-center bg-chart-3/10">
                    <NotebookPen className="h-7 w-7 text-chart-3" />
                  </div>
                  <div className="space-y-2">
                    <p className="font-serif text-lg font-semibold text-foreground">
                      No notes yet
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Generate AI-powered notes from your papers
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
                      style={{ animationDelay: `${i * 60}ms` }}
                    >
                      <div className="group flex h-full flex-col gap-2.5 rounded-xl border border-border bg-card px-5 py-4 transition-colors duration-200 hover:bg-secondary">
                        <p className="text-sm font-semibold leading-snug capitalize transition-colors duration-300 group-hover:text-primary">
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

      {/* Footer */}
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6">
          <span className="font-serif text-xs text-muted-foreground/40">Cool Paper</span>
          <span className="text-[11px] text-muted-foreground/30">
            Immersive arXiv reader
          </span>
        </div>
      </footer>

      <AddPaperDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={handlePaperAdded}
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
