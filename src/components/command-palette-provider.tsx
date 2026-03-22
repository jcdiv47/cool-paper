"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { CommandPalette } from "./command-palette";
import { AddPaperDialog } from "./add-paper-dialog";

interface CommandPaletteProviderProps {
  children: ReactNode;
}

export function CommandPaletteProvider({
  children,
}: CommandPaletteProviderProps) {
  const [open, setOpen] = useState(false);
  const [addPaperOpen, setAddPaperOpen] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    },
    []
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const handleImportPaper = useCallback(() => {
    setOpen(false);
    // Small delay so the command palette dialog fully closes before
    // opening the add-paper dialog, avoiding focus-trap conflicts.
    requestAnimationFrame(() => {
      setAddPaperOpen(true);
    });
  }, []);

  return (
    <>
      {children}
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        onImportPaper={handleImportPaper}
      />
      <AddPaperDialog
        open={addPaperOpen}
        onOpenChange={setAddPaperOpen}
        onAdded={() => setAddPaperOpen(false)}
      />
    </>
  );
}
