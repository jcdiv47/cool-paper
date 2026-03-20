"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { FileText, MessageCircle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { CitationMarkdown, type CitationTarget } from "@/components/citation-markdown";
import { parseCitationTokens } from "@/lib/citations";
import type { PaperMetadata } from "@/types";

interface SummaryViewProps {
  paper: PaperMetadata;
  compact?: boolean;
  onViewPdf?: () => void;
  onNavigate?: (href: string) => void;
}

export function SummaryView({
  paper,
  compact = false,
  onViewPdf,
  onNavigate,
}: SummaryViewProps) {
  const router = useRouter();
  const summary = useMemo(() => {
    const raw = paper.summary?.trim();
    if (!raw) return raw;
    // Strip legacy prelude (title/authors/abstract) that was prepended before
    // the UI started rendering metadata directly from paper fields.
    const guideStart = raw.indexOf("## Reading Guide");
    if (guideStart > 0) return raw.slice(guideStart).trim();
    return raw;
  }, [paper.summary]);
  const sanitizedId = paper.arxivId.replace(/\//g, "_");
  const citationRefIds = useMemo(
    () => (summary ? [...new Set(parseCitationTokens(summary).map((token) => token.refId))] : []),
    [summary],
  );
  const citationTargetsResult = useQuery(
    api.paperChunks.resolveBySanitizedId,
    citationRefIds.length > 0
      ? {
          sanitizedId,
          refIds: citationRefIds,
        }
      : "skip",
  );
  const citationTargets = useMemo<Record<string, CitationTarget>>(
    () =>
      Object.fromEntries(
        (citationTargetsResult ?? []).map((chunk) => [
          chunk.refId,
          {
            refId: chunk.refId,
            page: chunk.page,
            sanitizedId: chunk.sanitizedId,
            section: chunk.section,
          },
        ]),
      ),
    [citationTargetsResult],
  );

  const publishedDate = new Date(paper.published);
  const formattedDate = publishedDate.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });



  const containerCls = compact
    ? "mx-auto max-w-3xl px-5 py-6 sm:px-6 sm:py-7"
    : "mx-auto max-w-3xl px-6 py-10 sm:px-10 sm:py-14";

  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain">
        <div className={containerCls}>
          {/* Paper metadata — always visible */}
          <h1
            className={
              compact
                ? "font-serif text-xl font-bold leading-snug tracking-[-0.02em] text-foreground sm:text-2xl"
                : "font-serif text-2xl font-bold leading-snug tracking-[-0.02em] text-foreground sm:text-3xl md:text-[2.25rem] md:leading-[1.15]"
            }
          >
            {paper.title}
          </h1>

          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground/50">
            <time className="font-mono">{formattedDate}</time>
            <span className="font-mono">{paper.arxivId}</span>
            {paper.categories.map((cat) => (
              <span
                key={cat}
                className="rounded-md border border-border/60 bg-transparent px-1.5 py-px font-mono text-[10px] text-muted-foreground"
              >
                {cat}
              </span>
            ))}
            <div className="ml-auto flex items-center gap-1.5">
              {onViewPdf && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 gap-1 px-2 text-[10px]"
                  onClick={onViewPdf}
                >
                  <FileText className="h-3 w-3" />
                  PDF
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                className="h-6 gap-1 px-2 text-[10px]"
                onClick={() => router.push(`/chat/new?paperIds=${sanitizedId}`)}
              >
                <MessageCircle className="h-3 w-3" />
                New Chat
              </Button>
            </div>
          </div>

          <div className={compact ? "my-6 h-px bg-border" : "my-8 h-px bg-border"} />

          {/* Abstract */}
          {paper.abstract && (
            <div className={summary ? (compact ? "mb-6" : "mb-8") : undefined}>
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
            </div>
          )}

          {/* Summary */}
          {summary ? (
            <article
              className={
                compact
                  ? "prose prose-sm prose-summary max-w-none prose-invert"
                  : "prose prose-lg prose-summary max-w-none prose-invert"
              }
            >
              <CitationMarkdown
                content={summary}
                targets={citationTargets}
                onNavigate={onNavigate}
              />
            </article>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              Guided summary is being generated.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
