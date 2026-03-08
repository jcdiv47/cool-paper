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

function getCategoryColor(cat: string) {
  const key = cat.toLowerCase();
  if (key === "cs.cl")
    return {
      accent: "oklch(0.7 0.15 250)",
      bg: "bg-sky-500/10",
      text: "text-sky-400",
      border: "border-sky-500/20",
    };
  if (key === "cs.ai")
    return {
      accent: "oklch(0.75 0.14 75)",
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/20",
    };
  if (key === "cs.lg")
    return {
      accent: "oklch(0.72 0.16 155)",
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/20",
    };
  if (key === "cs.cv")
    return {
      accent: "oklch(0.68 0.17 295)",
      bg: "bg-violet-500/10",
      text: "text-violet-400",
      border: "border-violet-500/20",
    };
  if (key === "cs.ro")
    return {
      accent: "oklch(0.68 0.19 25)",
      bg: "bg-red-500/10",
      text: "text-red-400",
      border: "border-red-500/20",
    };
  if (key === "cs.se")
    return {
      accent: "oklch(0.7 0.14 200)",
      bg: "bg-cyan-500/10",
      text: "text-cyan-400",
      border: "border-cyan-500/20",
    };
  if (key.startsWith("math"))
    return {
      accent: "oklch(0.7 0.15 350)",
      bg: "bg-pink-500/10",
      text: "text-pink-400",
      border: "border-pink-500/20",
    };
  if (key.startsWith("stat"))
    return {
      accent: "oklch(0.65 0.18 275)",
      bg: "bg-indigo-500/10",
      text: "text-indigo-400",
      border: "border-indigo-500/20",
    };
  return {
    accent: "oklch(0.55 0.02 286)",
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    border: "border-zinc-500/20",
  };
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
    paper.abstract.length > 180
      ? paper.abstract.slice(0, 180) + "..."
      : paper.abstract;

  const primaryColor = getCategoryColor(paper.categories[0] ?? "");

  const dateStr = new Date(paper.published).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <>
      <Link
        href={`/paper/${sanitizedId}`}
        className="animate-card-enter block"
        style={{ animationDelay: `${index * 60}ms` }}
      >
        <Card
          className="group relative h-full overflow-hidden border-border/30 bg-card/30 transition-all duration-300 hover:-translate-y-1 hover:border-border/50"
          style={
            {
              borderLeftWidth: "3px",
              borderLeftColor: primaryColor.accent,
              boxShadow: `inset 3px 0 12px -6px ${primaryColor.accent.replace(")", " / 15%)")}`,
            } as React.CSSProperties
          }
        >
          {/* Hover glow overlay */}
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            style={{
              background: `radial-gradient(ellipse at 20% 0%, ${primaryColor.accent.replace(")", " / 8%)")}, transparent 60%)`,
            }}
          />

          <div className="relative">
            <div className="space-y-3 p-5">
              {/* Top row: category indicator + date */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: primaryColor.accent }}
                  />
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                    {paper.categories[0]}
                  </span>
                  <span className="text-[10px] text-muted-foreground/30">
                    /
                  </span>
                  <span className="text-[10px] text-muted-foreground/40">
                    {dateStr}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {noteCount > 0 && (
                    <button
                      className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        router.push(`/paper/${sanitizedId}?tab=notes`);
                      }}
                    >
                      <FileText className="h-2.5 w-2.5" />
                      {noteCount}
                    </button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
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
              <h3 className="font-serif text-[17px] leading-snug font-medium line-clamp-2 tracking-tight">
                {paper.title}
              </h3>

              {/* Authors */}
              <p className="text-[13px] text-muted-foreground/60 italic">
                {truncatedAuthors}
              </p>

              {/* Abstract */}
              <p className="line-clamp-3 text-[13px] leading-relaxed text-muted-foreground/45">
                {abstractExcerpt}
              </p>

              {/* Category badges */}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {paper.categories.slice(0, 4).map((cat) => {
                  const color = getCategoryColor(cat);
                  return (
                    <span
                      key={cat}
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-medium ${color.bg} ${color.text} ${color.border}`}
                    >
                      {cat}
                    </span>
                  );
                })}
              </div>
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
