"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/header";
import { AddPaperDialog } from "@/components/add-paper-dialog";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2 } from "lucide-react";
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
import { Toaster, toast } from "sonner";
import { removeByPrefix } from "@/lib/cache";
import type { PaperMetadata } from "@/types";

interface PaperListProps {
  papers: PaperMetadata[];
  loading: boolean;
  search: string;
  onSelect: (sanitizedId: string) => void;
  onDelete: (arxivId: string) => void;
}

function PaperList({ papers, loading, search, onSelect, onDelete }: PaperListProps) {
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const filtered = search.trim()
    ? papers.filter((p) => {
        const q = search.toLowerCase();
        return (
          p.title.toLowerCase().includes(q) ||
          p.authors.some((a) => a.toLowerCase().includes(q)) ||
          p.arxivId.includes(q)
        );
      })
    : papers;

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-muted/20" />
        ))}
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-muted-foreground">
            {papers.length === 0 ? "No papers yet" : "No matching papers"}
          </p>
          <p className="text-xs text-muted-foreground/60">
            {papers.length === 0
              ? "Add a paper from arXiv to get started"
              : "Try a different search term"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {filtered.map((paper) => {
          const sanitizedId = paper.arxivId.replace(/\//g, "_");
          return (
            <div key={paper.arxivId} className="group relative">
              <Button
                variant="ghost"
                onClick={() => onSelect(sanitizedId)}
                className="flex h-auto w-full flex-col items-start gap-1.5 rounded-xl border border-border/30 px-4 py-3 text-left font-normal hover:border-border/60 hover:bg-muted/20"
              >
                <p className="text-sm font-medium leading-tight pr-8 line-clamp-2">
                  {paper.title}
                </p>
                <span className="font-mono text-[11px] text-muted-foreground/40">
                  arXiv:{paper.arxivId}
                </span>
                <p className="text-xs leading-relaxed text-muted-foreground/60 line-clamp-2">
                  {paper.abstract}
                </p>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-3 h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(paper.arxivId);
                }}
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete paper</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this paper and all its notes. This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (deleteTarget) onDelete(deleteTarget);
                setDeleteTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function PaperListPage() {
  const router = useRouter();
  const [papers, setPapers] = useState<PaperMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const fetchPapers = useCallback(async () => {
    try {
      const res = await fetch("/api/papers");
      const data = await res.json();
      setPapers(data);
    } catch {
      toast.error("Failed to load papers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  async function handleDelete(arxivId: string) {
    const sanitized = arxivId.replace(/\//g, "_");
    try {
      await fetch(`/api/papers/${sanitized}`, { method: "DELETE" });
      removeByPrefix(`paper:meta:${sanitized}`);
      removeByPrefix(`paper:notes:${sanitized}`);
      removeByPrefix(`paper:note:${sanitized}`);
      removeByPrefix(`paper:threads:${sanitized}`);
      setPapers((prev) => prev.filter((p) => p.arxivId !== arxivId));
      toast.success("Paper removed");
    } catch {
      toast.error("Failed to delete paper");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="bottom-right" />
      <Header search={search} onSearchChange={setSearch}>
        <span className="text-sm font-medium">Papers</span>
        <div className="flex-1" />
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Paper
        </Button>
      </Header>
      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <PaperList
          papers={papers}
          loading={loading}
          search={search}
          onSelect={(id) => router.push(`/paper/${id}`)}
          onDelete={handleDelete}
        />
      </main>
      <AddPaperDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          fetchPapers();
          toast.success("Paper added successfully");
        }}
      />
    </div>
  );
}
