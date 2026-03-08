"use client";

import { useState, useEffect, useMemo } from "react";
import { PaperCard } from "./paper-card";
import { Input } from "@/components/ui/input";
import { Search, FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaperMetadata, NoteFile } from "@/types";

interface PaperGridProps {
  papers: PaperMetadata[];
  onDelete: (arxivId: string) => void;
  onAdd: () => void;
}

export function PaperGrid({ papers, onDelete, onAdd }: PaperGridProps) {
  const [search, setSearch] = useState("");
  const [noteCounts, setNoteCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    async function fetchNoteCounts() {
      const counts: Record<string, number> = {};
      for (const paper of papers) {
        const sanitizedId = paper.arxivId.replace(/\//g, "_");
        try {
          const res = await fetch(`/api/papers/${sanitizedId}/notes`);
          const notes: NoteFile[] = await res.json();
          counts[paper.arxivId] = notes.length;
        } catch {
          counts[paper.arxivId] = 0;
        }
      }
      setNoteCounts(counts);
    }
    fetchNoteCounts();
  }, [papers]);

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
        <div className="relative">
          <div className="absolute -inset-4 rounded-full bg-amber-500/5 blur-xl" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-border/30 bg-card/40">
            <FileText className="h-9 w-9 text-muted-foreground/40" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="font-serif text-2xl font-medium tracking-tight">
            Your library is empty
          </h2>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground/60">
            Start building your research collection by adding an arxiv paper
          </p>
        </div>
        <Button onClick={onAdd} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Your First Paper
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search + stats */}
      <div className="space-y-3">
        <div className="relative sm:max-w-lg">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/40" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, author, or category..."
            className="h-11 rounded-xl border-border/30 bg-card/20 pl-11 text-sm backdrop-blur-sm placeholder:text-muted-foreground/30 focus-visible:border-border/50 focus-visible:bg-card/30"
          />
        </div>
        <p className="text-[12px] tracking-wide text-muted-foreground/40">
          {filtered.length} {filtered.length === 1 ? "paper" : "papers"}
          {search && ` matching "${search}"`}
          {!search && " in your library"}
        </p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Search className="h-8 w-8 text-muted-foreground/20" />
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
              noteCount={noteCounts[paper.arxivId] ?? 0}
              onDelete={onDelete}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
