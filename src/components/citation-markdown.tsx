"use client";

import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { parseCitationTokens } from "@/lib/citations";
import { parseAnnotationTokens } from "@/lib/annotation-links";

export interface CitationTarget {
  refId: string;
  page: number;
  sanitizedId: string;
  section?: string;
}

export interface AnnotationTarget {
  annotationId: string;
  page: number;
  sanitizedId: string;
  kind: "highlight" | "note";
  comment?: string;
}

interface CitationMarkdownProps {
  content: string;
  targets?: Record<string, CitationTarget>;
  annotationTargets?: Record<string, AnnotationTarget>;
  showPaperLabel?: boolean;
  /** When provided, internal paper links call this instead of default navigation. */
  onNavigate?: (href: string) => void;
}

function formatCitationLabel(
  target: CitationTarget | undefined,
  showPaperLabel: boolean
): string {
  if (!target) return "cite";
  if (showPaperLabel) return `${target.sanitizedId} · p.${target.page}`;
  return `p.${target.page}`;
}

function formatAnnotationLabel(
  target: AnnotationTarget | undefined,
  showPaperLabel: boolean
): string {
  if (!target) return "annotation";
  const kind = target.kind === "note" ? "note" : "highlight";
  if (showPaperLabel) return `${target.sanitizedId} · ${kind} · p.${target.page}`;
  return `${kind} · p.${target.page}`;
}

function buildCitationHref(
  target: CitationTarget | undefined,
  refId: string
): string {
  if (!target) return `cite-missing:${refId}`;
  const params = new URLSearchParams({
    tab: "pdf",
    page: String(target.page),
    cite: refId,
  });
  return `/paper/${target.sanitizedId}?${params.toString()}`;
}

function buildAnnotationHref(
  target: AnnotationTarget | undefined,
  annotationId: string
): string {
  if (!target) return `annot-missing:${annotationId}`;
  const params = new URLSearchParams({
    tab: "pdf",
    page: String(target.page),
    annotation: annotationId,
  });
  return `/paper/${target.sanitizedId}?${params.toString()}`;
}

function rewriteCitationMarkdown(
  content: string,
  targets: Record<string, CitationTarget>,
  annotationTargets: Record<string, AnnotationTarget>,
  showPaperLabel: boolean
): string {
  const citations = parseCitationTokens(content);
  const annotations = parseAnnotationTokens(content);
  if (citations.length === 0 && annotations.length === 0) return content;

  const tokens = [
    ...citations.map((citation) => ({ type: "citation" as const, ...citation })),
    ...annotations.map((annotation) => ({
      type: "annotation" as const,
      ...annotation,
    })),
  ].sort((a, b) => a.start - b.start);

  let cursor = 0;
  let rewritten = "";
  for (const token of tokens) {
    rewritten += content.slice(cursor, token.start);

    if (token.type === "citation") {
      const target = targets[token.refId];
      const label = formatCitationLabel(target, showPaperLabel);
      const href = buildCitationHref(target, token.refId);
      rewritten += `[${label}](${href})`;
    } else {
      const target = annotationTargets[token.annotationId];
      const label = formatAnnotationLabel(target, showPaperLabel);
      const href = buildAnnotationHref(target, token.annotationId);
      rewritten += `[${label}](${href})`;
    }

    cursor = token.end;
  }
  rewritten += content.slice(cursor);
  return rewritten;
}

export function CitationMarkdown({
  content,
  targets = {},
  annotationTargets = {},
  showPaperLabel = false,
  onNavigate,
}: CitationMarkdownProps) {
  const rewritten = useMemo(
    () =>
      rewriteCitationMarkdown(
        content,
        targets,
        annotationTargets,
        showPaperLabel
      ),
    [annotationTargets, content, targets, showPaperLabel]
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeHighlight, rehypeKatex]}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith("/paper/")) {
            const isAnnotationLink = href.includes("annotation=");
            return (
              <a
                href={href}
                className={isAnnotationLink ? "citation-chip annotation-chip" : "citation-chip"}
                onClick={onNavigate ? (e) => { e.preventDefault(); onNavigate(href); } : undefined}
              >
                {children}
              </a>
            );
          }

          if (href?.startsWith("cite-missing:")) {
            return <span className="citation-chip citation-chip-missing">{children}</span>;
          }

          if (href?.startsWith("annot-missing:")) {
            return (
              <span className="citation-chip annotation-chip annotation-chip-missing">
                {children}
              </span>
            );
          }

          return (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-border underline-offset-4 transition-colors hover:text-primary"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {rewritten}
    </ReactMarkdown>
  );
}
