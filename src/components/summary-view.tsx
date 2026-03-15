"use client";

import type { PaperMetadata } from "@/types";
import { ExternalLink } from "lucide-react";

interface SummaryViewProps {
  paper: PaperMetadata;
}

export function SummaryView({ paper }: SummaryViewProps) {
  const publishedDate = new Date(paper.published);
  const formattedDate = publishedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const arxivUrl = paper.arxivId.includes("/")
    ? `https://arxiv.org/abs/${paper.arxivId}`
    : `https://arxiv.org/abs/${paper.arxivId}`;

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-6 py-10 sm:px-10 sm:py-14">
          {/* Title */}
          <h1 className="font-serif text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl md:text-[2.25rem] md:leading-[1.15]">
            {paper.title}
          </h1>

          {/* Metadata row: arXiv ID, categories, date */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/50">
            <a
              href={arxivUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-center gap-1.5 rounded-md bg-secondary px-2 py-0.5 font-mono transition-colors hover:bg-primary/10 hover:text-primary"
            >
              arXiv:{paper.arxivId}
              <ExternalLink className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-100" />
            </a>
            <span className="text-border">·</span>
            <time className="font-mono">{formattedDate}</time>
            {paper.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-md border border-border bg-secondary px-1.5 py-px font-mono text-[10px] text-muted-foreground"
              >
                {cat}
              </span>
            ))}
          </div>

          {/* Divider */}
          <div className="my-8 h-px bg-border" />

          {/* Authors */}
          <div className="mb-10">
            <p className="text-sm leading-relaxed text-muted-foreground/70">
              {(() => {
                const full = paper.authors.join(", ");
                if (full.length <= 300) return full;
                const truncated = full.slice(0, 300);
                const lastComma = truncated.lastIndexOf(",");
                return truncated.slice(0, lastComma) + ", ...";
              })()}
            </p>
          </div>

          {/* Abstract */}
          <div>
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/50">
              Abstract
            </h2>
            <p className="font-serif text-[1.05rem] leading-[1.85] text-foreground/85 sm:text-lg sm:leading-[1.9]">
              {paper.abstract}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
