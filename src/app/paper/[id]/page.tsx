"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/header";
import { PdfViewer } from "@/components/pdf-viewer";
import { NotesSidebar } from "@/components/notes-sidebar";
import { NoteViewer } from "@/components/note-viewer";
import { GenerateNoteDialog } from "@/components/generate-note-dialog";
import { useGenerateJob } from "@/hooks/use-generate-job";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, BookOpen } from "lucide-react";
import { Toaster } from "sonner";
import type { PaperMetadata, NoteFile } from "@/types";

export default function PaperPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [paper, setPaper] = useState<PaperMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [notesKey, setNotesKey] = useState(0);
  const [selectedNote, setSelectedNote] = useState<string | null>(null);
  const [view, setView] = useState<"pdf" | "note">(
    searchParams.get("tab") === "notes" ? "note" : "pdf"
  );
  const [notes, setNotes] = useState<NoteFile[]>([]);
  const [mobileSidebar, setMobileSidebar] = useState(false);

  const refreshNotes = useCallback(() => {
    setNotesKey((k) => k + 1);
  }, []);

  const job = useGenerateJob(id, refreshNotes);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/papers/${id}`);
        if (!res.ok) throw new Error();
        setPaper(await res.json());
      } catch {
        router.push("/");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  function handleSelectNote(filename: string) {
    setSelectedNote(filename);
    setView("note");
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
            variant={view === "pdf" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setView("pdf")}
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
              setView("note");
            }}
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Note</span>
          </Button>
        </div>
      </Header>

      <div className="flex flex-1 overflow-hidden">
        {/* Main content area: PDF always mounted, note overlays it */}
        <div className="relative min-h-0 flex-1">
          <div className={view === "pdf" || !selectedNote ? "h-full" : "invisible absolute inset-0"}>
            <PdfViewer paperId={id} />
          </div>
          {selectedNote && (
            <div className={view === "note" ? "h-full" : "invisible absolute inset-0"}>
              <NoteViewer
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
                setView("pdf");
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
        className={`fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-opacity md:hidden ${mobileSidebar ? "opacity-0 pointer-events-none" : "opacity-100"}`}
        onClick={() => setMobileSidebar(true)}
        aria-label="Open notes"
      >
        <FileText className="h-5 w-5" />
        {notes.length > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
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
