"use client";

import { X, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { buildPaperWorkspaceHref } from "@/lib/paper-workspace";
import type { PaperMetadata } from "@/types";

interface PaperCardRowProps {
  papers: PaperMetadata[];
  onRemove: (paperId: string) => void;
  onAddClick: () => void;
}

export function PaperCardRow({ papers, onRemove, onAddClick }: PaperCardRowProps) {
  const canRemove = papers.length > 1;

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 sm:px-8">
      {papers.map((paper) => {
        const sanitizedId = paper.arxivId.replace(/\//g, "_");
        return (
          <div
            key={paper.arxivId}
            className="group relative flex min-w-[180px] max-w-[220px] shrink-0 flex-col gap-1 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors duration-200 hover:bg-secondary"
          >
            <p className="line-clamp-2 text-xs font-medium leading-tight">
              {paper.title}
            </p>
            <Link
              href={buildPaperWorkspaceHref(sanitizedId)}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-2.5 w-2.5" />
              View PDF
            </Link>
            {canRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute -right-1.5 -top-1.5 h-5 w-5 border border-border bg-background opacity-0 transition-opacity group-hover:opacity-100"
                onClick={() => onRemove(sanitizedId)}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}
      <Button
        variant="outline"
        onClick={onAddClick}
        className="flex h-auto min-w-[120px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-dashed px-3 py-2 font-normal text-muted-foreground/50 hover:text-foreground"
      >
        <Plus className="h-4 w-4" />
        <span className="text-[10px]">Add Paper</span>
      </Button>
    </div>
  );
}
