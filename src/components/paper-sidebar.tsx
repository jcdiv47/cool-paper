"use client";

import { NotesSidebar } from "./notes-sidebar";
import { ThreadsSidebar } from "./threads-sidebar";
import type { ThreadListItem } from "@/types";

interface PaperSidebarProps {
  paperId: string;
  mode: "notes" | "threads";
  notesKey: number;
  generating: boolean;
  selectedNote: string | null;
  selectedThread: string | null;
  threadsKey: number;
  onGenerate: () => void;
  onSelectNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onDeleteThread: (threadId: string) => void;
  onThreadsLoaded?: (threads: ThreadListItem[]) => void;
}

export function PaperSidebar({
  paperId,
  mode,
  notesKey,
  generating,
  selectedNote,
  selectedThread,
  threadsKey,
  onGenerate,
  onSelectNote,
  onDeleteNote,
  onSelectThread,
  onNewThread,
  onDeleteThread,
  onThreadsLoaded,
}: PaperSidebarProps) {
  return (
    <div className="flex h-full flex-col">
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
