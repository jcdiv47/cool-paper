"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/header";
import { PaperGrid } from "@/components/paper-grid";
import { AddPaperDialog } from "@/components/add-paper-dialog";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { Toaster, toast } from "sonner";
import type { PaperMetadata } from "@/types";

export default function Home() {
  const [papers, setPapers] = useState<PaperMetadata[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setAddOpen(true);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  async function handleDelete(arxivId: string) {
    const sanitized = arxivId.replace(/\//g, "_");
    try {
      await fetch(`/api/papers/${sanitized}`, { method: "DELETE" });
      setPapers((prev) => prev.filter((p) => p.arxivId !== arxivId));
      toast.success("Paper removed");
    } catch {
      toast.error("Failed to delete paper");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Toaster richColors position="bottom-right" />
      <Header>
        <Button
          size="sm"
          className="ml-auto gap-1.5"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Add Paper
          <kbd className="pointer-events-none ml-1 hidden h-5 select-none items-center rounded border border-primary-foreground/20 bg-primary-foreground/10 px-1 font-mono text-[10px] font-medium opacity-60 sm:inline-flex">
            ⌘K
          </kbd>
        </Button>
      </Header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        {loading ? (
          <div className="space-y-6">
            {/* Skeleton search */}
            <div className="space-y-3">
              <div className="h-11 w-full max-w-lg animate-shimmer rounded-xl border border-border/20 bg-card/15" />
              <div className="h-3 w-32 animate-shimmer rounded bg-muted/20" />
            </div>
            {/* Skeleton cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="animate-card-enter rounded-xl border border-border/20 bg-card/15 p-5"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 rounded-full bg-muted/30 animate-shimmer" />
                      <div className="h-2.5 w-12 rounded bg-muted/20 animate-shimmer" />
                    </div>
                    <div className="h-5 w-3/4 rounded bg-muted/25 animate-shimmer" />
                    <div className="h-3 w-1/2 rounded bg-muted/15 animate-shimmer" />
                    <div className="space-y-1.5">
                      <div className="h-3 w-full rounded bg-muted/12 animate-shimmer" />
                      <div className="h-3 w-5/6 rounded bg-muted/12 animate-shimmer" />
                    </div>
                    <div className="flex gap-1.5 pt-1">
                      <div className="h-5 w-11 rounded-md bg-muted/15 animate-shimmer" />
                      <div className="h-5 w-11 rounded-md bg-muted/15 animate-shimmer" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <PaperGrid
            papers={papers}
            onDelete={handleDelete}
            onAdd={() => setAddOpen(true)}
          />
        )}
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
