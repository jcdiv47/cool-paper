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
import { Trash2, Loader2, AlertTriangle, RotateCcw, MessageCircle, Highlighter } from "lucide-react";
import { stageLabel } from "@/lib/import-status";
import type { PaperMetadata } from "@/types";

interface PaperCardProps {
  paper: PaperMetadata;
  onDelete: (arxivId: string) => void;
  onRetry?: (arxivId: string) => void;
  index: number;
  threadCount?: number;
  annotationCount?: number;
}

export function PaperCard({
  paper,
  onDelete,
  onRetry,
  index,
  threadCount,
  annotationCount,
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
        <Card className={`group h-full border-border/40 bg-card/80 backdrop-blur-sm transition-all duration-300 hover:border-primary/25 hover:bg-card hover:shadow-lg hover:shadow-primary/5 ${
          paper.importState.phase === "importing" ? "border-l-2 border-l-muted-foreground/20" :
          paper.importState.phase === "failed" ? "border-l-2 border-l-destructive/40" : ""
        }`}>
          <div className="space-y-3 px-5 py-5">
            {/* Meta row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground/50">
                <span className="rounded-full bg-primary/10 px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider text-primary">
                  {paper.categories[0]}
                </span>
                <span className="text-border">·</span>
                <time>{dateStr}</time>
                {paper.importState.phase === "importing" && (
                  <>
                    <span className="text-border">·</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                      {stageLabel(paper.importState.stage)}
                    </span>
                  </>
                )}
                {paper.importState.phase === "failed" && (
                  <>
                    <span className="text-border">·</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 font-mono text-[10px] text-destructive">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      IMPORT FAILED
                    </span>
                  </>
                )}
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
            <p className="text-[12px] text-muted-foreground/50">
              {truncatedAuthors}
            </p>

            {/* Abstract */}
            <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground/45">
              {abstractExcerpt}
            </p>

            {/* Category tags */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {paper.categories.slice(0, 3).map((cat) => (
                <span
                  key={cat}
                  className="rounded-full border border-border/50 bg-muted/20 px-2 py-px font-mono text-[10px] text-muted-foreground"
                >
                  {cat}
                </span>
              ))}
            </div>

            {/* Engagement stats (optional) */}
            {(threadCount !== undefined && threadCount > 0) || (annotationCount !== undefined && annotationCount > 0) ? (
              <div className="flex items-center gap-3 pt-1.5 border-t border-border/20">
                {threadCount !== undefined && threadCount > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <MessageCircle className="h-2.5 w-2.5" />
                    <span className="tabular-nums">{threadCount}</span>
                    <span>chats</span>
                  </div>
                )}
                {annotationCount !== undefined && annotationCount > 0 && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
                    <Highlighter className="h-2.5 w-2.5" />
                    <span className="tabular-nums">{annotationCount}</span>
                    <span>notes</span>
                  </div>
                )}
              </div>
            ) : null}
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
