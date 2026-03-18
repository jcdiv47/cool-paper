"use client";

import { useMemo } from "react";
import { PaperCard } from "./paper-card";
import { Search, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaperMetadata } from "@/types";

interface PaperGridProps {
  papers: PaperMetadata[];
  onDelete: (arxivId: string) => void;
  onAdd: () => void;
  search: string;
}

export function PaperGrid({ papers, onDelete, onAdd, search }: PaperGridProps) {
  const filtered = useMemo(() => {
    if (!search.trim()) return papers;
    const q = search.toLowerCase();
    return papers.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.authors.some((a) => a.toLowerCase().includes(q)) ||
        p.arxivId.toLowerCase().includes(q) ||
        p.categories.some((c) => c.toLowerCase().includes(q))
    );
  }, [papers, search]);

  if (papers.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/40 bg-card/30">
          <FileText className="h-7 w-7 text-muted-foreground/30" />
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-xl font-medium tracking-tight">
            Your library is empty
          </h2>
          <p className="max-w-xs text-sm text-muted-foreground/60">
            Add an arxiv paper to get started
          </p>
        </div>
        <Button onClick={onAdd} variant="outline" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Paper
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Search className="h-6 w-6 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground/50">
            No papers match &ldquo;{search}&rdquo;
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((paper, i) => (
            <PaperCard
              key={paper.arxivId}
              paper={paper}
              onDelete={onDelete}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
