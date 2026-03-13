"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FileText, Loader2, PenLine, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useCachedFetch } from "@/hooks/use-cached-fetch";
import { MODEL_OPTIONS } from "@/lib/models";
import type { NoteFile } from "@/types";

interface NotesSidebarProps {
  paperId: string;
  generating?: boolean;
  selectedNote?: string | null;
  onGenerate: () => void;
  onSelectNote: (filename: string) => void;
  onDeleteNote: (filename: string) => void;
  onNotesLoaded?: (notes: NoteFile[]) => void;
}

export function NotesSidebar({ paperId, generating, selectedNote, onGenerate, onSelectNote, onDeleteNote, onNotesLoaded }: NotesSidebarProps) {
  const { data: fetchedNotes, loading, refetch: fetchNotes } = useCachedFetch<NoteFile[]>(
    `/api/papers/${paperId}/notes`,
    { cacheKey: `paper:notes:${paperId}` }
  );

  const notes = fetchedNotes ?? [];
  const [displayNotes, setDisplayNotes] = useState<NoteFile[]>([]);
  const [search, setSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Sync displayNotes and notify parent when fetched notes change
  useEffect(() => {
    if (fetchedNotes) {
      setDisplayNotes(fetchedNotes);
      onNotesLoaded?.(fetchedNotes);
    }
  }, [fetchedNotes]);

  const handleSearch = useCallback(
    (q: string) => {
      setSearch(q);
      if (debounceRef.current) clearTimeout(debounceRef.current);

      if (!q.trim()) {
        setDisplayNotes(notes);
        setSearching(false);
        return;
      }

      setSearching(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(
            `/api/papers/${paperId}/notes?q=${encodeURIComponent(q.trim())}`
          );
          const data = await res.json();
          setDisplayNotes(data);
        } catch {
          setDisplayNotes([]);
        } finally {
          setSearching(false);
        }
      }, 300);
    },
    [paperId, notes]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border/40 px-4 py-2">
        <h3 className="text-sm font-semibold">Notes</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchNotes}
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={onGenerate}
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <PenLine className="h-3 w-3" />
            )}
            {generating ? "Generating…" : "Generate"}
          </Button>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="relative px-3 py-2">
          <Search className="absolute left-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          {searching ? (
            <Loader2 className="absolute right-5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : search && (
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => handleSearch("")}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
          <Input
            placeholder="Search notes…"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-8 pl-8 pr-8 text-xs"
          />
        </div>
      )}

      <ScrollArea className="flex-1">
        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-lg bg-muted"
              />
            ))}
          </div>
        ) : displayNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-8 text-center">
            {search ? (
              <>
                <Search className="h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm font-medium text-muted-foreground">
                  No matching notes
                </p>
              </>
            ) : (
              <>
                <FileText className="h-8 w-8 text-muted-foreground/50" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-muted-foreground">
                    No notes yet
                  </p>
                  <p className="text-xs text-muted-foreground/60">
                    Generate AI notes or add them manually
                  </p>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="px-3 py-2">
            {displayNotes.map((note, i) => (
              <div key={note.filename}>
                <div className="group relative">
                  <Button
                    variant="ghost"
                    onClick={() => onSelectNote(note.filename)}
                    className={`flex h-auto w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left font-normal ${
                      selectedNote === note.filename
                        ? "bg-primary/10 ring-1 ring-primary/20 text-foreground"
                        : ""
                    }`}
                  >
                    <FileText className={`h-4 w-4 shrink-0 ${
                      selectedNote === note.filename ? "text-foreground" : "text-muted-foreground"
                    }`} />
                    <div className="w-0 flex-1">
                      <p className="truncate text-sm font-medium capitalize">{note.title}</p>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
                        <span>{new Date(note.modifiedAt).toLocaleString()}</span>
                        {note.model && (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                            {MODEL_OPTIONS.find((m) => m.id === note.model)?.label ?? note.model}
                          </Badge>
                        )}
                      </div>
                      {note.snippet && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground/80 italic">
                          {note.snippet}
                        </p>
                      )}
                    </div>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 md:hidden md:group-hover:flex"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(note.filename);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
                {i < displayNotes.length - 1 && <Separator className="my-0.5" />}
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete note</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this note. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDeleteNote(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
