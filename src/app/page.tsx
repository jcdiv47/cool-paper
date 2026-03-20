"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Header } from "@/components/header";
import { PaperCard } from "@/components/paper-card";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { StatsBlock } from "@/components/stats-block";
import { AddPaperDialog } from "@/components/add-paper-dialog";
import { useDeletePaper, useRetryImport } from "@/hooks/use-paper-actions";
import { parseImportStatus, importStateSortKey } from "@/lib/import-status";
import { Button } from "@/components/ui/button";
import { Plus, ArrowRight, BookOpen } from "lucide-react";
import { Toaster, toast } from "sonner";
import Link from "next/link";
import type { PaperMetadata } from "@/types";

export default function Home() {
  const [addOpen, setAddOpen] = useState(false);

  const convexPapers = useQuery(api.papers.list);
  const loading = convexPapers === undefined;

  const papers: PaperMetadata[] = (convexPapers ?? []).map((p) => ({
    arxivId: p.arxivId,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract,
    summary: p.summary,
    published: p.published,
    categories: p.categories,
    addedAt: p.addedAt,
    importState: parseImportStatus(p.importStatus),
  }));

  // Sort: failed → importing → completed, preserving addedAt within groups
  papers.sort((a, b) => importStateSortKey(a.importState) - importStateSortKey(b.importState));

  const deletePaper = useDeletePaper();
  const retryImport = useRetryImport();

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
      await deletePaper(sanitized);
      toast.success("Paper removal queued");
    } catch {
      toast.error("Failed to delete paper");
    }
  }

  async function handleRetry(arxivId: string) {
    const sanitized = arxivId.replace(/\//g, "_");
    try {
      await retryImport(sanitized);
      toast.success("Retrying import");
    } catch {
      toast.error("Failed to retry import");
    }
  }

  const handlePaperAdded = useCallback(() => {
    toast.success("Paper import started");
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
      <main className="mx-auto max-w-7xl px-4 py-10 pb-20 sm:px-6 sm:pb-10">
        {loading ? (
          <div className="space-y-8">
            <div className="space-y-3">
              <div className="h-10 w-full max-w-md animate-shimmer rounded-lg" />
              <div className="h-3 w-24 animate-shimmer rounded" />
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div
                  key={i}
                  className="animate-card-enter border border-border/20 p-5"
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
          <div className="space-y-16">
            {/* Hero heading + inline stats */}
            <section>
              <h1 className="font-serif text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
                Library
              </h1>
              {papers.length > 0 && (
                <div className="mt-2">
                  <StatsBlock papers={papers} />
                </div>
              )}
            </section>

            {/* Recently Added Papers */}
            <section>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Recent Papers
                </h2>
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
                <div className="flex flex-col items-center justify-center gap-6 border border-border bg-card py-24 text-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground/20" />
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
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {recentPapers.map((paper, i) => (
                    <PaperCard
                      key={paper.arxivId}
                      paper={paper}
                      onDelete={handleDelete}
                      onRetry={handleRetry}
                      index={i}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Activity */}
            {papers.length > 0 && (
              <section>
                <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Activity
                </h2>
                <ActivityHeatmap papers={papers} />
              </section>
            )}
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
    </div>
  );
}
