"use client";

import { useState, useEffect, useCallback, useRef, use } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
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
import { FileText, BookOpen, AlignLeft, MessageCircle, PenLine, Columns2 } from "lucide-react";
import { Toaster } from "sonner";
import type { PaperMetadata, NoteFile } from "@/types";

type View = "summary" | "pdf" | "note" | "split";

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

function ViewSwitcher({
  view,
  hasNotes,
  onSwitch,
  onNoteClick,
}: {
  view: View;
  hasNotes: boolean;
  onSwitch: (v: View) => void;
  onNoteClick: () => void;
}) {
  const activeClass = "bg-background text-foreground shadow-sm";
  const inactiveClass = "text-muted-foreground hover:text-foreground";

  return (
    <div className="flex items-center rounded-lg border border-border bg-secondary/60 p-0.5">
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 gap-1.5 text-xs transition-all ${view === "summary" ? activeClass : inactiveClass}`}
        onClick={() => onSwitch("summary")}
      >
        <AlignLeft className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Summary</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 gap-1.5 text-xs transition-all ${view === "pdf" ? activeClass : inactiveClass}`}
        onClick={() => onSwitch("pdf")}
      >
        <BookOpen className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">PDF</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className={`h-7 gap-1.5 text-xs transition-all ${(view === "note" || view === "split") ? activeClass : inactiveClass}`}
        onClick={onNoteClick}
      >
        <FileText className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Note</span>
      </Button>
      {hasNotes && (
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 gap-1.5 text-xs transition-all ${view === "split" ? activeClass : inactiveClass}`}
          onClick={() => onSwitch(view === "split" ? "note" : "split")}
          title="Split view: Note + PDF side by side"
        >
          <Columns2 className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Split</span>
        </Button>
      )}
    </div>
  );
}

export default function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [generateOpen, setGenerateOpen] = useState(false);
  const [notesKey, setNotesKey] = useState(0);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [view, setView] = useState<View>(
    searchParams.get("tab") === "notes"
      ? "note"
      : searchParams.get("tab") === "pdf"
        ? "pdf"
        : "summary"
  );
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const noteScrollTopRef = useRef(0);

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
  const switchView = useCallback((v: View) => {
    if (v === "split" && !selectedNote && notes.length > 0) {
      setSelectedNote(notes[0]!.filename);
    }
    setVisitedTabs((prev) => {
      const needed = v === "split" ? ["note", "pdf"] : [v];
      if (needed.every((t) => prev.has(t))) return prev;
      const next = new Set(prev);
      for (const t of needed) next.add(t);
      return next;
    });
    setView(v);
  }, [selectedNote, notes]);

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

  function handleNoteClick() {
    if (!selectedNote && notes.length > 0) {
      setSelectedNote(notes[0]!.filename);
    }
    switchView("note");
  }

  // When a citation/annotation link is clicked in the note, enter split view
  // and update URL params so the PdfViewer focuses the target.
  const handleCitationNavigate = useCallback(
    (href: string) => {
      const url = new URL(href, window.location.origin);
      const newParams = new URLSearchParams(searchParams.toString());
      for (const key of ["cite", "annotation", "page"]) {
        const val = url.searchParams.get(key);
        if (val) newParams.set(key, val);
        else newParams.delete(key);
      }
      newParams.delete("tab");
      router.replace(`${pathname}?${newParams.toString()}`, { scroll: false });
      switchView("split");
    },
    [pathname, router, searchParams, switchView],
  );

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header fullWidth breadcrumbs={[{ label: "Papers", href: "/paper" }, { label: "..." }]}>
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

  const viewSwitcher = (
    <ViewSwitcher
      view={view}
      hasNotes={notes.length > 0}
      onSwitch={switchView}
      onNoteClick={handleNoteClick}
    />
  );

  return (
    <div className="flex h-screen flex-col bg-background">
      <Toaster richColors position="bottom-right" />
      <Header
        fullWidth
        breadcrumbs={[
          { label: "Papers", href: "/paper" },
          { label: paper.title },
        ]}
        secondaryToolbar={viewSwitcher}
      >
        {/* Desktop: view switcher + chat button inline */}
        <div className="hidden shrink-0 items-center gap-2 md:flex">
          {viewSwitcher}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={handleChatAboutPaper}
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Chat
          </Button>
        </div>
        {/* Mobile: only chat button in main bar */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs md:hidden"
          onClick={handleChatAboutPaper}
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </Button>
      </Header>

      <div className="flex flex-1 overflow-hidden">
        {/* Split view: Note (left) + PDF (right) */}
        {view === "split" && selectedNote && (
          <div className="flex h-full min-h-0 flex-1">
            <div className="h-full min-w-0 flex-[4] border-r border-border/40">
              <LazyNoteViewer
                paperId={id}
                filename={selectedNote}
                onCitationNavigate={handleCitationNavigate}
                scrollTopRef={noteScrollTopRef}
              />
            </div>
            <div className="h-full min-w-0 flex-[6]">
              <LazyPdfViewer paperId={id} />
            </div>
          </div>
        )}

        {/* Main content area: views stacked with visibility toggling */}
        <div className={`relative min-h-0 flex-1 ${view === "split" ? "hidden" : ""}`}>
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
                  onCitationNavigate={handleCitationNavigate}
                  scrollTopRef={noteScrollTopRef}
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
                  <div className="flex h-14 w-14 items-center justify-center bg-secondary">
                    <PenLine className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <p className="text-base font-semibold text-foreground">
                      No notes yet for this paper
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Generate AI-powered notes to summarize, review, or analyze this paper
                    </p>
                  </div>
                  <Button
                    onClick={() => setGenerateOpen(true)}
                    className="gap-1.5"
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
                <div className="h-1 w-8 bg-muted-foreground/30" />
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
          className={`fixed bottom-20 right-6 z-30 transition-opacity sm:bottom-6 md:hidden ${mobileSidebar ? "opacity-0 pointer-events-none" : "opacity-100"}`}
          onClick={() => setMobileSidebar(true)}
          aria-label="Open sidebar"
        >
          <FileText className="h-4.5 w-4.5 text-foreground" />
          {notes.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4.5 min-w-4.5 items-center justify-center bg-foreground px-1 text-[10px] font-medium text-background">
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
