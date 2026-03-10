"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Header } from "@/components/header";
import { NotesSidebar } from "@/components/notes-sidebar";
import { SummaryView } from "@/components/summary-view";
import { GenerateNoteDialog } from "@/components/generate-note-dialog";
import { useGenerateJob } from "@/hooks/use-generate-job";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, BookOpen, AlignLeft } from "lucide-react";
import { Toaster } from "sonner";
import type { PaperMetadata, NoteFile } from "@/types";

function PdfSkeleton() {
  return <div className="flex h-full items-center justify-center bg-muted/20 animate-pulse" />;
}

function NoteSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-4 py-8 sm:px-8">
      <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
    </div>
  );
}

const LazyPdfViewer = dynamic(
  () => import("@/components/pdf-viewer").then((m) => ({ default: m.PdfViewer })),
  { ssr: false, loading: () => <PdfSkeleton /> }
);

const LazyNoteViewer = dynamic(
  () => import("@/components/note-viewer").then((m) => ({ default: m.NoteViewer })),
  { ssr: false, loading: () => <NoteSkeleton /> }
);

export default function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [notesKey, setNotesKey] = useState(0);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [view, setView] = useState<"summary" | "pdf" | "note">(
    searchParams.get("tab") === "notes"
      ? "note"
      : searchParams.get("tab") === "pdf"
        ? "pdf"
        : "summary"
  );
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [mobileSidebar, setMobileSidebar] = useState(false);

  // Track which tabs have been visited (lazy mount)
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => {
    const initial = new Set(["summary"]);
    const tab = searchParams.get("tab");
    if (tab === "pdf") initial.add("pdf");
    if (tab === "notes") initial.add("note");
    return initial;
  });

  // Mark tab as visited when switching
  const switchView = useCallback((v: "summary" | "pdf" | "note") => {
    setVisitedTabs((prev) => {
      if (prev.has(v)) return prev;
      const next = new Set(prev);
      next.add(v);
      return next;
    });
    setView(v);
  }, []);

  const refreshNotes = useCallback(() => {
    setNotesKey((k) => k + 1);
  }, []);

  const job = useGenerateJob(id, refreshNotes);

  // Cached paper metadata fetch
  const { data: paper, loading } = useCachedFetch<PaperMetadata>(
    `/api/papers/${id}`,
    { cacheKey: `paper:meta:${id}`, cacheOnly: true }
  );

  // Redirect home if paper not found after loading
  useEffect(() => {
    if (!loading && !paper) {
      router.push("/");
    }
  }, [loading, paper, router]);

  function handleSelectNote(filename: string) {
    setSelectedNote(filename);
    switchView("note");
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header>
          <Skeleton className="h-5 w-48" />
        </Header>
        <div className="flex flex-1">
          <div className="flex-1 animate-pulse bg-muted/20" />
          <div className="hidden w-80 border-l border-border/40 p-4 md:block">
            <div className="space-y-3">
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!paper) return null;

  return (
    <div className="flex h-screen flex-col bg-background">
      <Toaster richColors position="bottom-right" />
      <Header fullWidth>
        <p className="min-w-0 max-w-[30vw] truncate text-xs text-muted-foreground sm:max-w-xs sm:text-sm md:max-w-sm lg:max-w-md">
          {paper.title}
        </p>
        <div className="flex-1" />
        <div className="flex shrink-0 items-center rounded-lg border border-border/40 p-0.5">
          <Button
            variant={view === "summary" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => switchView("summary")}
          >
            <AlignLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Summary</span>
          </Button>
          <Button
            variant={view === "pdf" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => switchView("pdf")}
          >
            <BookOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">PDF</span>
          </Button>
          <Button
            variant={view === "note" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            disabled={notes.length === 0}
            onClick={() => {
              if (!selectedNote && notes.length > 0) {
                setSelectedNote(notes[0].filename);
              }
              switchView("note");
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Note</span>
          </Button>
        </div>
      </Header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content area: views stacked with visibility toggling */}
        <div className="relative min-h-0 flex-1">
          <div className={view === "summary" ? "h-full" : "invisible absolute inset-0"}>
            <SummaryView paper={paper} />
          </div>
          {visitedTabs.has("pdf") && (
            <div className={view === "pdf" ? "h-full" : "invisible absolute inset-0"}>
              <LazyPdfViewer paperId={id} />
            </div>
          )}
          {selectedNote && visitedTabs.has("note") && (
            <div className={view === "note" ? "h-full" : "invisible absolute inset-0"}>
              <LazyNoteViewer
                paperId={id}
                filename={selectedNote}
              />
            </div>
          )}
        </div>

        {/* Mobile backdrop */}
        <div
          className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${mobileSidebar ? "opacity-100" : "opacity-0 pointer-events-none"}`}
          onClick={() => setMobileSidebar(false)}
        />

        {/* Notes sidebar - bottom sheet on mobile, inline on desktop */}
        <div className={`
          fixed bottom-0 left-0 right-0 z-50 flex h-[70vh] flex-col rounded-t-xl border-t border-border/40 bg-background transition-transform duration-300
          md:relative md:z-auto md:flex md:h-auto md:w-96 md:translate-y-0 md:rounded-none md:border-l md:border-t-0 md:transition-none
          ${mobileSidebar ? "translate-y-0" : "translate-y-full md:translate-y-0"}
        `}>
          <button onClick={() => setMobileSidebar(false)} className="flex justify-center py-2 md:hidden" aria-label="Close notes">
            <div className="h-1 w-8 rounded-full bg-muted-foreground/30" />
          </button>
          <NotesSidebar
            key={notesKey}
            paperId={id}
            generating={job.generating}
            selectedNote={selectedNote}
            onGenerate={() => {
              setMobileSidebar(false);
              setGenerateOpen(true);
            }}
            onSelectNote={(filename) => {
              handleSelectNote(filename);
              setMobileSidebar(false);
            }}
            onDeleteNote={async (filename) => {
              await fetch(
                `/api/papers/${id}/notes/${encodeURIComponent(filename)}`,
                { method: "DELETE" }
              );
              if (selectedNote === filename) {
                setSelectedNote(null);
                switchView("summary");
              }
              refreshNotes();
            }}
            onNotesLoaded={(loaded) => {
              setNotes(loaded);
              if (
                searchParams.get("tab") === "notes" &&
                !selectedNote &&
                loaded.length > 0
              ) {
                setSelectedNote(loaded[0].filename);
              }
            }}
          />
        </div>
      </div>

      {/* Mobile FAB to access notes sidebar */}
      <button
        className={`fixed bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full border border-border bg-background shadow-md transition-opacity md:hidden ${mobileSidebar ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        onClick={() => setMobileSidebar(true)}
        aria-label="Open notes"
      >
        <FileText className="h-4.5 w-4.5 text-foreground" />
        {notes.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
            {notes.length}
          </span>
        )}
      </button>

      <GenerateNoteDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        paper={paper}
        generating={job.generating}
        output={job.output}
        cliCommand={job.cliCommand}
        onStartJob={job.startJob}
        onCancelJob={job.cancelJob}
      />
    </div>
  );
}
