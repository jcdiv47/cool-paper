"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NotesSidebar } from "./notes-sidebar";
import { ThreadsSidebar } from "./threads-sidebar";
import type { NoteFile, ThreadListItem } from "@/types";

interface PaperSidebarProps {
  paperId: string;
  notesKey: number;
  generating: boolean;
  selectedNote: string | null;
  selectedThread: string | null;
  threadsKey: number;
  onGenerate: () => void;
  onSelectNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onNotesLoaded: (notes: NoteFile[]) => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
  onThreadsLoaded?: (threads: ThreadListItem[]) => void;
}

export function PaperSidebar({
  paperId,
  notesKey,
  generating,
  selectedNote,
  selectedThread,
  threadsKey,
  onGenerate,
  onSelectNote,
  onDeleteNote,
  onNotesLoaded,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onThreadsLoaded,
}: PaperSidebarProps) {
  const [mode, setMode] = useState<"notes" | "threads">("notes");

  return (
    <div className="flex h-full flex-col">
      {/* Mode toggle */}
      <div className="flex items-center justify-center border-b border-border/40 px-4 py-2">
        <div className="flex items-center rounded-lg border border-border/40 p-0.5">
          <Button
            variant={mode === "notes" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("notes")}
          >
            Notes
          </Button>
          <Button
            variant={mode === "threads" ? "secondary" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => setMode("threads")}
          >
            Threads
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-0 flex-1">
        {mode === "notes" ? (
          <NotesSidebar
            key={notesKey}
            paperId={paperId}
            generating={generating}
            selectedNote={selectedNote}
            onGenerate={onGenerate}
            onSelectNote={onSelectNote}
            onDeleteNote={onDeleteNote}
            onNotesLoaded={onNotesLoaded}
          />
        ) : (
          <ThreadsSidebar
            paperId={paperId}
            selectedThread={selectedThread}
            onSelectThread={onSelectThread}
            onNewThread={onNewThread}
            onDeleteThread={onDeleteThread}
            onThreadsLoaded={onThreadsLoaded}
            invalidateKey={threadsKey}
          />
        )}
      </div>
    </div>
  );
}
