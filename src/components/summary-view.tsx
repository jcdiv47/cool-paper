"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PaperMetadata } from "@/types";

interface SummaryViewProps {
  paper: PaperMetadata;
  compact?: boolean;
  onViewPdf?: () => void;
}

export function SummaryView({ paper, compact = false, onViewPdf }: SummaryViewProps) {
  const summary = paper.summary?.trim();

  if (summary) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
          <article
            className={
              compact
                ? "prose prose-zinc prose-sm mx-auto max-w-3xl px-5 py-6 sm:px-6 sm:py-7 dark:prose-invert"
                : "prose prose-zinc mx-auto max-w-4xl px-6 py-10 sm:px-10 sm:py-14 dark:prose-invert"
            }
          >
            {onViewPdf && (
              <Button
                variant="outline"
                size="sm"
                className="not-prose mb-6 gap-1.5"
                onClick={onViewPdf}
              >
                <FileText className="h-3.5 w-3.5" />
                View PDF
              </Button>
            )}
            <ReactMarkdown
              remarkPlugins={[remarkGfm, remarkMath]}
              rehypePlugins={[
                rehypeHighlight,
                [rehypeKatex, { throwOnError: false }] as [
                  typeof rehypeKatex,
                  { throwOnError: boolean },
                ],
              ]}
            >
              {summary}
            </ReactMarkdown>
          </article>
        </div>
      </div>
    );
  }

  const publishedDate = new Date(paper.published);
  const formattedDate = publishedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div
          className={
            compact
              ? "mx-auto max-w-3xl px-5 py-6 sm:px-6 sm:py-7"
              : "mx-auto max-w-4xl px-6 py-10 sm:px-10 sm:py-14"
          }
        >
          {onViewPdf && (
            <Button
              variant="outline"
              size="sm"
              className="mb-6 gap-1.5"
              onClick={onViewPdf}
            >
              <FileText className="h-3.5 w-3.5" />
              View PDF
            </Button>
          )}
          <h1
            className={
              compact
                ? "font-serif text-xl font-bold leading-snug tracking-tight text-foreground sm:text-2xl"
                : "font-serif text-2xl font-bold leading-snug tracking-tight text-foreground sm:text-3xl md:text-[2.25rem] md:leading-[1.15]"
            }
          >
            {paper.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/50">
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
          <div className={compact ? "my-6 h-px bg-border" : "my-8 h-px bg-border"} />
          <div className={compact ? "mb-8" : "mb-10"}>
            <p className="text-sm leading-relaxed text-muted-foreground/70">
              {paper.authors.join(", ")}
            </p>
          </div>
          <div>
            <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.2em] text-primary/50">
              Abstract
            </h2>
            <p
              className={
                compact
                  ? "font-serif text-[1rem] leading-[1.8] text-foreground/85"
                  : "font-serif text-[1.05rem] leading-[1.85] text-foreground/85 sm:text-lg sm:leading-[1.9]"
              }
            >
              {paper.abstract}
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Guided summary is being generated.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
