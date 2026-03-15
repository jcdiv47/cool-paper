"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Header } from "@/components/header";
import { NotesSidebar } from "@/components/notes-sidebar";
import { SummaryView } from "@/components/summary-view";
import { GenerateNoteDialog } from "@/components/generate-note-dialog";
import { useConvexGenerateJob } from "@/hooks/use-convex-generate-job";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, BookOpen, AlignLeft, MessageCircle, PenLine } from "lucide-react";
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
  const [mobileSidebar, setMobileSidebar] = useState(false);

  // Notes from Convex (realtime)
  const convexNotes = useQuery(api.notes.listByPaper, { sanitizedPaperId: id });
  const notes: NoteFile[] = (convexNotes ?? []).map((n) => ({
    filename: n.filename,
    title: n.title,
    modifiedAt: n.modifiedAt,
    model: n.model,
  }));

  // Auto-select first note when arriving via ?tab=notes
  useEffect(() => {
    if (
      searchParams.get("tab") === "notes" &&
      !selectedNote &&
      notes.length > 0
    ) {
      setSelectedNote(notes[0]!.filename);
    }
  }, [notes, searchParams, selectedNote]);

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

  const job = useConvexGenerateJob(id, refreshNotes);

  // Paper metadata from Convex (realtime)
  const convexPaper = useQuery(api.papers.get, { sanitizedId: id });
  const loading = convexPaper === undefined;
  const paper: PaperMetadata | null = convexPaper
    ? {
        arxivId: convexPaper.arxivId,
        title: convexPaper.title,
        authors: convexPaper.authors,
        abstract: convexPaper.abstract,
        published: convexPaper.published,
        categories: convexPaper.categories,
        addedAt: convexPaper.addedAt,
      }
    : null;

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

  function handleChatAboutPaper() {
    router.push(`/chat/new?paperIds=${id}`);
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
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center rounded-lg border border-border/40 p-0.5">
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
              onClick={() => {
                if (!selectedNote && notes.length > 0) {
                  setSelectedNote(notes[0]!.filename);
                }
                switchView("note");
              }}
            >
              <FileText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Note</span>
            </Button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleChatAboutPaper}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Chat</span>
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
          {visitedTabs.has("note") && (
            <div className={view === "note" ? "h-full" : "invisible absolute inset-0"}>
              {selectedNote ? (
                <LazyNoteViewer
                  paperId={id}
                  filename={selectedNote}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                  <FileText className="h-10 w-10 text-muted-foreground/30" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-muted-foreground">
                      No notes yet for this paper
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      Generate AI-powered notes to summarize, review, or analyze this paper
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => setGenerateOpen(true)}
                  >
                    <PenLine className="h-4 w-4" />
                    Generate Note
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        {view === "note" && (
          <>
            {/* Mobile backdrop */}
            <div
              className={`fixed inset-0 z-40 bg-black/40 transition-opacity md:hidden ${mobileSidebar ? "opacity-100" : "opacity-0 pointer-events-none"}`}
              onClick={() => setMobileSidebar(false)}
            />

            {/* Sidebar - bottom sheet on mobile, inline on desktop */}
            <div className={`
              fixed bottom-0 left-0 right-0 z-50 flex h-[70vh] flex-col rounded-t-xl border-t border-border/40 bg-background transition-transform duration-300
              md:relative md:z-auto md:flex md:h-auto md:w-96 md:translate-y-0 md:rounded-none md:border-l md:border-t-0 md:transition-none
              ${mobileSidebar ? "translate-y-0" : "translate-y-full md:translate-y-0"}
            `}>
              <Button variant="ghost" onClick={() => setMobileSidebar(false)} className="flex justify-center py-2 md:hidden" aria-label="Close sidebar">
                <div className="h-1 w-8 rounded-full bg-muted-foreground/30" />
              </Button>
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
              />
            </div>
          </>
        )}
      </div>

      {/* Mobile FAB to access sidebar (only for note tab) */}
      {view === "note" && (
        <Button
          variant="outline"
          size="icon-lg"
          className={`fixed bottom-6 right-6 z-30 rounded-full shadow-md transition-opacity md:hidden ${mobileSidebar ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          onClick={() => setMobileSidebar(true)}
          aria-label="Open sidebar"
        >
          <FileText className="h-4.5 w-4.5 text-foreground" />
          {notes.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium text-background">
              {notes.length}
            </span>
          )}
        </Button>
      )}

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
