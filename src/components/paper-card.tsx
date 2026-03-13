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
import { useRouter } from "next/navigation";
import { FileText, Trash2 } from "lucide-react";
import type { PaperMetadata } from "@/types";

interface PaperCardProps {
  paper: PaperMetadata;
  noteCount: number;
  onDelete: (arxivId: string) => void;
  index: number;
}

export function PaperCard({
  paper,
  noteCount,
  onDelete,
  index,
}: PaperCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const router = useRouter();
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
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <Card className="group h-full border-border/40 bg-card/40 transition-colors duration-200 hover:border-border hover:bg-card/70">
          <div className="space-y-2 px-5 py-3.5">
            {/* Meta row */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60">
                <span className="font-mono uppercase tracking-wider">
                  {paper.categories[0]}
                </span>
                <span>·</span>
                <time>{dateStr}</time>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-70"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setConfirmOpen(true);
                }}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" />
              </Button>
            </div>

            {/* Title */}
            <h3 className="font-serif text-base font-medium leading-snug tracking-tight line-clamp-2">
              {paper.title}
            </h3>

            {/* Authors */}
            <p className="text-[12px] italic text-muted-foreground/70">
              {truncatedAuthors}
            </p>

            {/* Abstract */}
            <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground/50">
              {abstractExcerpt}
            </p>

            {/* Category tags + note count */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {paper.categories.slice(0, 3).map((cat) => (
                <span
                  key={cat}
                  className="rounded border border-border/50 px-1.5 py-px font-mono text-[10px] text-muted-foreground/40"
                >
                  {cat}
                </span>
              ))}
              {noteCount > 0 && (
                <Button
                  variant="ghost"
                  size="xs"
                  className="text-[11px] text-muted-foreground/80 hover:text-foreground"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    router.push(`/paper/${sanitizedId}?tab=notes`);
                  }}
                >
                  <FileText className="h-3 w-3" />
                  {noteCount}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </Link>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
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
