"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { motion, useReducedMotion } from "framer-motion";
import { Header } from "@/components/header";
import { PaperCard } from "@/components/paper-card";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import { SpotlightRow } from "@/components/dashboard/spotlight-row";
import { CategoryChart } from "@/components/dashboard/category-chart";
import { ResearchTimeline } from "@/components/dashboard/research-timeline";
import { ActivityFeed } from "@/components/dashboard/activity-feed";
import { AddPaperDialog } from "@/components/add-paper-dialog";
import { useDeletePaper, useRetryImport } from "@/hooks/use-paper-actions";
import { parseImportStatus, importStateSortKey } from "@/lib/import-status";
import { Button } from "@/components/ui/button";
import {
  Plus,
  ArrowRight,
  BookOpen,
  MessageCircle,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import Link from "next/link";
import type { PaperMetadata } from "@/types";

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------
const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
} as const;

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
} as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Home() {
  const [addOpen, setAddOpen] = useState(false);
  const prefersReduced = useReducedMotion();

  // ---- Data queries (consolidated: 2 subscriptions instead of 7) ----
  const convexPapers = useQuery(api.papers.list);
  const dashboard = useQuery(api.dashboard.unified);

  const dashboardStats = dashboard?.stats;
  const spotlightPapers = dashboard?.spotlightPapers;
  const categoryData = dashboard?.categoryDistribution;
  const timelineData = dashboard?.activityTimeline;
  const activityFeed = dashboard?.recentActivity;
  const heatmapData = dashboard?.heatmap;

  const loading = convexPapers === undefined;

  const papers: PaperMetadata[] = useMemo(
    () =>
      (convexPapers ?? []).map((p) => ({
        arxivId: p.arxivId,
        title: p.title,
        authors: p.authors,
        abstract: p.abstract,
        summary: p.summary,
        published: p.published,
        categories: p.categories,
        addedAt: p.addedAt,
        importState: parseImportStatus(p.importStatus),
      })),
    [convexPapers]
  );

  // Sort: failed → importing → completed
  const sortedPapers = useMemo(() => {
    const sorted = [...papers];
    sorted.sort(
      (a, b) => importStateSortKey(a.importState) - importStateSortKey(b.importState)
    );
    return sorted;
  }, [papers]);

  // Build engagement lookup from spotlight data for paper cards
  const engagementMap = useMemo(() => {
    const map: Record<string, { threadCount: number; annotationCount: number }> = {};
    if (spotlightPapers) {
      for (const sp of spotlightPapers) {
        map[sp.sanitizedId] = {
          threadCount: sp.threadCount,
          annotationCount: sp.annotationCount,
        };
      }
    }
    return map;
  }, [spotlightPapers]);

  const deletePaper = useDeletePaper();
  const retryImport = useRetryImport();

  // ---- Keyboard shortcut ----
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

  const PAPER_LIMIT = 6;
  const displayPapers = sortedPapers.slice(0, PAPER_LIMIT);
  const hasMore = sortedPapers.length > PAPER_LIMIT;

  // Animation props — disabled if user prefers reduced motion
  const motionProps = prefersReduced
    ? {}
    : {
        variants: sectionVariants,
        initial: "hidden" as const,
        animate: "visible" as const,
        transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] },
      };

  return (
    <div className="min-h-screen bg-background">
      <Toaster
        richColors
        position="bottom-right"
        toastOptions={{
          className:
            "!rounded-xl !border-border/60 !bg-card/95 !backdrop-blur-xl",
        }}
      />
      <Header>
        <Button
          size="sm"
          className="ml-auto gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Paper
          <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center rounded-md border border-primary-foreground/20 bg-primary-foreground/10 px-1 font-mono text-[10px] font-medium opacity-60 sm:inline-flex">
            ⌘K
          </kbd>
        </Button>
      </Header>

      <main className="mx-auto max-w-7xl px-4 py-10 pb-24 sm:px-6 sm:pb-10">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <motion.div
            className="space-y-14"
            variants={prefersReduced ? undefined : staggerContainer}
            initial={prefersReduced ? undefined : "hidden"}
            animate={prefersReduced ? undefined : "visible"}
          >
            {/* ============================================================
                ZONE A: Hero — heading + stats + heatmap
               ============================================================ */}
            <motion.section className="space-y-6" {...motionProps}>
              <div>
                <h1 className="font-serif text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                  Your Research
                </h1>
                <p className="mt-1 text-sm text-muted-foreground/60">
                  {papers.length > 0
                    ? "Your personal research dashboard"
                    : "Start building your paper library"}
                </p>
              </div>

              {dashboardStats && (
                <DashboardStats stats={dashboardStats} />
              )}

              {papers.length > 0 && (
                <ActivityHeatmap data={heatmapData ?? undefined} />
              )}
            </motion.section>

            {/* ============================================================
                ZONE B: Spotlight — most discussed papers
               ============================================================ */}
            {spotlightPapers && spotlightPapers.length > 0 && (
              <motion.div {...motionProps}>
                <SpotlightRow papers={spotlightPapers} />
              </motion.div>
            )}

            {/* ============================================================
                ZONE C: Two-column insights — category chart + timeline
               ============================================================ */}
            {(categoryData && categoryData.length > 0) ||
            (timelineData && timelineData.length > 0) ? (
              <motion.section
                className="grid gap-5 lg:grid-cols-2"
                {...motionProps}
              >
                {categoryData && categoryData.length > 0 && (
                  <CategoryChart data={categoryData} />
                )}
                {timelineData && timelineData.length > 0 && (
                  <ResearchTimeline data={timelineData} />
                )}
              </motion.section>
            ) : null}

            {/* ============================================================
                ZONE D: Activity feed
               ============================================================ */}
            {activityFeed && activityFeed.length > 0 && (
              <motion.div {...motionProps}>
                <ActivityFeed activities={activityFeed} />
              </motion.div>
            )}

            {/* ============================================================
                ZONE E: Papers grid
               ============================================================ */}
            <motion.section {...motionProps}>
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Recent Papers
                </h2>
                <div className="flex items-center gap-2">
                  {sortedPapers.length > PAPER_LIMIT && (
                    <Link
                      href="/paper"
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-primary"
                    >
                      View all {sortedPapers.length} papers
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

              {sortedPapers.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-6 rounded-2xl border border-dashed border-border/50 bg-card/50 py-24 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <BookOpen className="h-8 w-8 text-primary/50" />
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
                <>
                  <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {displayPapers.map((paper, i) => {
                      const sanitizedId = paper.arxivId.replace(/\//g, "_");
                      const engagement = engagementMap[sanitizedId];
                      return (
                        <PaperCard
                          key={paper.arxivId}
                          paper={paper}
                          onDelete={handleDelete}
                          onRetry={handleRetry}
                          index={i}
                          threadCount={engagement?.threadCount}
                          annotationCount={engagement?.annotationCount}
                        />
                      );
                    })}
                  </div>
                  {hasMore && (
                    <div className="mt-6 flex justify-center">
                      <Link href="/paper">
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                        >
                          View all {sortedPapers.length} papers
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    </div>
                  )}
                </>
              )}
            </motion.section>
          </motion.div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-border/30 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground/60 hover:text-primary"
              onClick={() => setAddOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Paper
            </Button>
            <Link href="/paper">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground/60 hover:text-primary"
              >
                <BookOpen className="h-3.5 w-3.5" />
                Browse Papers
              </Button>
            </Link>
            <Link href="/chat">
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground/60 hover:text-primary"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Start Chat
              </Button>
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <span className="font-serif text-xs text-muted-foreground/30">
              Cool Paper
            </span>
            <span className="text-[11px] text-muted-foreground/20">
              Immersive arXiv reader
            </span>
          </div>
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

// ---------------------------------------------------------------------------
// Loading skeleton
// ---------------------------------------------------------------------------
function LoadingSkeleton() {
  return (
    <div className="space-y-14">
      {/* Hero skeleton */}
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="h-10 w-56 animate-shimmer rounded-xl" />
          <div className="h-4 w-48 animate-shimmer rounded-lg" />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-9 w-28 animate-shimmer rounded-full"
              style={{ animationDelay: `${i * 60}ms` }}
            />
          ))}
        </div>
        <div className="h-40 animate-shimmer rounded-xl" />
      </div>

      {/* Spotlight skeleton */}
      <div className="space-y-4">
        <div className="h-3 w-28 animate-shimmer rounded-lg" />
        <div className="flex gap-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-44 min-w-[300px] animate-shimmer rounded-xl"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>

      {/* Charts skeleton */}
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-64 animate-shimmer rounded-xl" />
        <div className="h-64 animate-shimmer rounded-xl" />
      </div>

      {/* Activity feed skeleton */}
      <div className="space-y-4">
        <div className="h-3 w-28 animate-shimmer rounded-lg" />
        <div className="space-y-0 rounded-xl border border-border/20">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="h-7 w-7 animate-shimmer rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-3/4 animate-shimmer rounded-lg" />
                <div className="h-2.5 w-1/2 animate-shimmer rounded-lg" />
              </div>
              <div className="h-2.5 w-12 animate-shimmer rounded-lg" />
            </div>
          ))}
        </div>
      </div>

      {/* Paper grid skeleton */}
      <div className="space-y-6">
        <div className="h-3 w-20 animate-shimmer rounded-lg" />
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="animate-card-enter rounded-xl border border-border/20 p-5"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="space-y-3">
                <div className="h-3 w-20 animate-shimmer rounded-lg" />
                <div className="h-5 w-3/4 animate-shimmer rounded-lg" />
                <div className="h-3 w-1/2 animate-shimmer rounded-lg" />
                <div className="space-y-1.5">
                  <div className="h-3 w-full animate-shimmer rounded-lg" />
                  <div className="h-3 w-5/6 animate-shimmer rounded-lg" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
