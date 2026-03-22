"use client";

import { useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Header } from "@/components/header";
import { AddPaperDialog } from "@/components/add-paper-dialog";
import { useDeletePaper, useRetryImport } from "@/hooks/use-paper-actions";
import { parseImportStatus, importStateSortKey, stageLabel } from "@/lib/import-status";
import { Button } from "@/components/ui/button";
import { Plus, FileText, Trash2, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
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
import type { PaperMetadata } from "@/types";

interface PaperListProps {
  papers: PaperMetadata[];
  loading: boolean;
  search: string;
  onSelect: (sanitizedId: string) => void;
  onDelete: (arxivId: string) => void;
  onRetry: (arxivId: string) => void;
}

function PaperList({ papers, loading, search, onSelect, onDelete, onRetry }: PaperListProps) {
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
      <div className="flex flex-col items-center justify-center gap-5 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
          <FileText className="h-6 w-6 text-primary/50" />
        </div>
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-foreground">
            {papers.length === 0 ? "No papers yet" : "No matching papers"}
          </p>
          <p className="text-sm text-muted-foreground">
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
                className="flex h-auto w-full flex-col items-start gap-1.5 rounded-xl border border-border/40 bg-card/60 px-4 py-3.5 text-left font-normal text-foreground whitespace-normal overflow-hidden transition-all duration-200 hover:border-primary/20 hover:bg-card hover:text-foreground hover:shadow-md hover:shadow-primary/5"
              >
                <p className="text-sm font-semibold leading-tight pr-8 line-clamp-2 transition-colors duration-300 group-hover:text-primary">
                  {paper.title}
                </p>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full bg-secondary/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground/50">
                    arXiv:{paper.arxivId}
                  </span>
                  {paper.importState.phase === "importing" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      {stageLabel(paper.importState.stage)}
                    </span>
                  )}
                  {paper.importState.phase === "failed" && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      IMPORT FAILED
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground/50 line-clamp-2">
                  {paper.abstract}
                </p>
              </Button>
              <div className="absolute right-2 top-3 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                {paper.importState.phase === "failed" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 rounded-lg"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRetry(paper.arxivId);
                    }}
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteTarget(paper.arxivId);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
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
              This will permanently delete this paper. This
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
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const deletePaper = useDeletePaper();

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

  papers.sort((a, b) => importStateSortKey(a.importState) - importStateSortKey(b.importState));

  const retryImport = useRetryImport();

  const handleRetry = useCallback(async (arxivId: string) => {
    const sanitized = arxivId.replace(/\//g, "_");
    try {
      await retryImport(sanitized);
      toast.success("Retrying import");
    } catch {
      toast.error("Failed to retry import");
    }
  }, [retryImport]);

  const deletePaperTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleDelete = useCallback((arxivId: string) => {
    const sanitized = arxivId.replace(/\//g, "_");
    if (deletePaperTimerRef.current) clearTimeout(deletePaperTimerRef.current);

    const timer = setTimeout(async () => {
      deletePaperTimerRef.current = null;
      try {
        await deletePaper(sanitized);
        toast.success("Paper removed");
      } catch {
        toast.error("Failed to delete paper");
      }
    }, 5000);

    deletePaperTimerRef.current = timer;

    toast("Paper will be deleted.", {
      action: {
        label: "Undo",
        onClick: () => {
          if (deletePaperTimerRef.current) {
            clearTimeout(deletePaperTimerRef.current);
            deletePaperTimerRef.current = null;
          }
          toast.success("Paper deletion cancelled");
        },
      },
      duration: 5000,
    });
  }, [deletePaper]);

  return (
    <div className="min-h-screen bg-background">
      <Toaster
        richColors
        position="bottom-right"
        toastOptions={{
          className: "!rounded-xl !border-border/60 !bg-card/95 !backdrop-blur-xl",
        }}
      />
      <Header search={search} onSearchChange={setSearch} pageTitle="Papers">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Paper
        </Button>
      </Header>
      <main className="mx-auto max-w-2xl px-4 py-8 pb-24 sm:px-6 sm:pb-8">
        <PaperList
          papers={papers}
          loading={loading}
          search={search}
          onSelect={(id) => router.push(`/paper/${id}`)}
          onDelete={handleDelete}
          onRetry={handleRetry}
        />
      </main>
      <AddPaperDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdded={() => {
          toast.success("Paper import started");
        }}
      />
    </div>
  );
}
