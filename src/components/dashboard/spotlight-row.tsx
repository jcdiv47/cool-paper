"use client";

import { SpotlightPaperCard } from "./spotlight-paper-card";

interface SpotlightPaper {
  sanitizedId: string;
  title: string;
  authors: string[];
  summary?: string;
  categories: string[];
  published: string;
  threadCount: number;
  messageCount: number;
  annotationCount: number;
  citationCount: number;
}

interface SpotlightRowProps {
  papers: SpotlightPaper[];
}

export function SpotlightRow({ papers }: SpotlightRowProps) {
  if (papers.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Most Discussed
      </h2>
      <div className="flex gap-4 overflow-x-auto pb-2 scroll-smooth snap-x snap-mandatory [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {papers.map((paper, i) => (
          <SpotlightPaperCard key={paper.sanitizedId} paper={paper} index={i} />
        ))}
      </div>
    </section>
  );
}
