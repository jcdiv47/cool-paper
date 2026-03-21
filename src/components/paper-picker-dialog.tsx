"use client";

import { useState, useEffect, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Check, Loader2, AlertTriangle } from "lucide-react";
import { parseImportStatus, stageLabel } from "@/lib/import-status";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const convexPapers = useQuery(api.papers.list);
  const loading = convexPapers === undefined;
  const papers: PaperMetadata[] = (convexPapers ?? []).map((p) => ({
    arxivId: p.arxivId,
    title: p.title,
    authors: p.authors,
    abstract: p.abstract,
    summary: p.summary,
    published: p.published,
    categories: p.categories,
    addedAt: p.addedAt,
    importState: parseImportStatus(p.importStatus),
  }));

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
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
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
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
                    className="flex items-start gap-3 rounded-lg py-2.5"
                  >
                    {multi && (
                      <div
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border"
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium leading-tight line-clamp-2">
                          {paper.title}
                        </p>
                        {paper.importState.phase === "importing" && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            {stageLabel(paper.importState.stage)}
                          </span>
                        )}
                        {paper.importState.phase === "failed" && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Failed
                          </span>
                        )}
                      </div>
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
        <div className="border-t border-border/40 p-2 flex justify-end">
          <button
            onClick={handleConfirm}
            className="rounded-lg bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-md shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/25"
          >
            Add {selected.size} paper{selected.size > 1 ? "s" : ""}
          </button>
        </div>
      )}
    </CommandDialog>
  );
}
