"use client";

import { useState, useEffect, useMemo } from "react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Check } from "lucide-react";
import type { PaperMetadata } from "@/types";

interface PaperPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Papers to exclude from the list (already added) */
  excludeIds?: string[];
  /** Allow multiple selection */
  multi?: boolean;
  onSelect: (paperIds: string[]) => void;
}

export function PaperPickerDialog({
  open,
  onOpenChange,
  excludeIds = [],
  multi = false,
  onSelect,
}: PaperPickerDialogProps) {
  const [papers, setPapers] = useState<PaperMetadata[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setLoading(true);
    fetch("/api/papers")
      .then((r) => r.json())
      .then((data) => setPapers(data))
      .catch(() => setPapers([]))
      .finally(() => setLoading(false));
  }, [open]);

  const excludeSet = useMemo(() => new Set(excludeIds), [excludeIds]);

  const available = useMemo(
    () =>
      papers.filter((p) => {
        const sanitizedId = p.arxivId.replace(/\//g, "_");
        return !excludeSet.has(sanitizedId) && !excludeSet.has(p.arxivId);
      }),
    [papers, excludeSet]
  );

  function handleSelect(arxivId: string) {
    const sanitizedId = arxivId.replace(/\//g, "_");
    if (multi) {
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(sanitizedId)) next.delete(sanitizedId);
        else next.add(sanitizedId);
        return next;
      });
    } else {
      onSelect([sanitizedId]);
      onOpenChange(false);
    }
  }

  function handleConfirm() {
    if (selected.size > 0) {
      onSelect(Array.from(selected));
      onOpenChange(false);
    }
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={multi ? "Select Papers" : "Select a Paper"}
      description="Search your library by title, author, or arXiv ID"
    >
      <CommandInput placeholder="Search papers..." />
      <CommandList>
        {loading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : (
          <>
            <CommandEmpty>
              {papers.length === 0 ? "No papers in library" : "No matching papers"}
            </CommandEmpty>
            <CommandGroup>
              {available.map((paper) => {
                const sanitizedId = paper.arxivId.replace(/\//g, "_");
                const isSelected = selected.has(sanitizedId);
                return (
                  <CommandItem
                    key={paper.arxivId}
                    value={`${paper.title} ${paper.authors.join(" ")} ${paper.arxivId}`}
                    onSelect={() => handleSelect(paper.arxivId)}
                    className="flex items-start gap-3 py-2.5"
                  >
                    {multi && (
                      <div
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-tight line-clamp-2">
                        {paper.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground/60 truncate">
                        {paper.authors.slice(0, 3).join(", ")}
                        {paper.authors.length > 3 ? " et al." : ""}
                      </p>
                    </div>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
      {multi && selected.size > 0 && (
        <div className="border-t p-2 flex justify-end">
          <button
            onClick={handleConfirm}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Add {selected.size} paper{selected.size > 1 ? "s" : ""}
          </button>
        </div>
      )}
    </CommandDialog>
  );
}
