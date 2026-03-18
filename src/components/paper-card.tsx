"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Trash2, Loader2, AlertTriangle, RotateCcw } from "lucide-react";
import { stageLabel } from "@/lib/import-status";
import type { PaperMetadata } from "@/types";

interface PaperCardProps {
  paper: PaperMetadata;
  onDelete: (arxivId: string) => void;
  onRetry?: (arxivId: string) => void;
  index: number;
}

export function PaperCard({
  paper,
  onDelete,
  onRetry,
  index,
}: PaperCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const sanitizedId = paper.arxivId.replace(/\//g, "_");

  const truncatedAuthors =
    paper.authors.length > 3
      ? paper.authors.slice(0, 3).join(", ") + ` +${paper.authors.length - 3}`
      : paper.authors.join(", ");

  const abstractExcerpt =
    paper.abstract.length > 160
      ? paper.abstract.slice(0, 160) + "..."
      : paper.abstract;

  const dateStr = new Date(paper.published).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });

  return (
    <>
      <Link
        href={`/paper/${sanitizedId}`}
        className="animate-card-enter block"
        style={{ animationDelay: `${index * 60}ms` }}
      >
        <Card className={`group h-full border-border bg-card transition-colors duration-200 hover:bg-secondary ${
          paper.importState.phase === "importing" ? "border-l-2 border-l-muted-foreground/20" :
          paper.importState.phase === "failed" ? "border-l-2 border-l-destructive/40" : ""
        }`}>
          <div className="space-y-2.5 px-5 py-4">
            {/* Meta row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/50">
                {paper.importState.phase === "importing" ? (
                  <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    {stageLabel(paper.importState.stage)}
                  </span>
                ) : paper.importState.phase === "failed" ? (
                  <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[10px] text-destructive">
                    <AlertTriangle className="h-2.5 w-2.5" />
                    IMPORT FAILED
                  </span>
                ) : (
                  <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                    {paper.categories[0]}
                  </span>
                )}
                <span className="text-border">·</span>
                <time>{dateStr}</time>
              </div>
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-70">
                {paper.importState.phase === "failed" && onRetry && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRetry(paper.arxivId);
                    }}
                  >
                    <RotateCcw className="h-3 w-3 text-muted-foreground hover:text-primary" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setConfirmOpen(true);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>

            {/* Title */}
            <h3 className="font-serif text-base font-semibold leading-snug tracking-tight line-clamp-2 group-hover:text-primary transition-colors duration-300">
              {paper.title}
            </h3>

            {/* Authors */}
            <p className="text-[12px] text-muted-foreground/60">
              {truncatedAuthors}
            </p>

            {/* Abstract */}
            <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground/40">
              {abstractExcerpt}
            </p>

            {/* Category tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {paper.categories.slice(0, 3).map((cat) => (
                <span
                  key={cat}
                  className="rounded-md border border-border bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground"
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </Card>
      </Link>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
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
              onClick={() => onDelete(paper.arxivId)}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
