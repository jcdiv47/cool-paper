"use client";

import { NotesSidebar } from "./notes-sidebar";

interface PaperSidebarProps {
  paperId: string;
  notesKey: number;
  generating: boolean;
  selectedNote: string | null;
  onGenerate: () => void;
  onSelectNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
}

export function PaperSidebar({
  paperId,
  notesKey,
  generating,
  selectedNote,
  onGenerate,
  onSelectNote,
  onDeleteNote,
}: PaperSidebarProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <NotesSidebar
          key={notesKey}
          paperId={paperId}
          generating={generating}
          selectedNote={selectedNote}
          onGenerate={onGenerate}
          onSelectNote={onSelectNote}
          onDeleteNote={onDeleteNote}
        />
      </div>
    </div>
  );
}
