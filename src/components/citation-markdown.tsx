"use client";

import { useMemo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { parseCitationTokens } from "@/lib/citations";
import { parseAnnotationTokens } from "@/lib/annotation-links";
import { buildPaperWorkspaceHref } from "@/lib/paper-workspace";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  exact?: string;
}

interface CitationMarkdownProps {
  content: string;
  targets?: Record<string, CitationTarget>;
  annotationTargets?: Record<string, AnnotationTarget>;
  showPaperLabel?: boolean;
  sanitizePartial?: boolean;
  paperLinkParams?: Record<string, never>;
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
  refId: string,
): string {
  if (!target) return `cite-missing:${refId}`;
  return buildPaperWorkspaceHref(target.sanitizedId, {
    page: target.page,
    cite: refId,
  });
}

function buildAnnotationHref(
  target: AnnotationTarget | undefined,
  annotationId: string,
): string {
  if (!target) return `annot-missing:${annotationId}`;
  return buildPaperWorkspaceHref(target.sanitizedId, {
    page: target.page,
    annotation: annotationId,
  });
}

function rewriteCitationMarkdown(
  content: string,
  targets: Record<string, CitationTarget>,
  annotationTargets: Record<string, AnnotationTarget>,
  showPaperLabel: boolean,
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

function sanitizePartialMarkdown(text: string): string {
  const fenceCount = (text.match(/^```/gm) || []).length;
  if (fenceCount % 2 !== 0) {
    text += "\n```";
  }

  const mathCount = (text.match(/\$\$/g) || []).length;
  if (mathCount % 2 !== 0) {
    text += "\n$$";
  }

  return text.replace(/\[\[(?:cite|annot):[^\]]*$/, "");
}

function AnnotationPopoverChip({
  target,
  children,
}: {
  target: AnnotationTarget;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="citation-chip annotation-chip cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            setOpen((v) => !v);
          }}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="max-h-64 w-80 overflow-y-auto text-sm"
      >
        {target.exact && (
          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground">
            {target.exact}
          </blockquote>
        )}
        {target.comment && (
          <p className={target.exact ? "mt-2 text-foreground" : "text-foreground"}>
            {target.comment}
          </p>
        )}
        {!target.exact && !target.comment && (
          <p className="text-muted-foreground">No content</p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          {target.kind === "note" ? "Note" : "Highlight"} · p.{target.page}
        </p>
      </PopoverContent>
    </Popover>
  );
}

function extractAnnotationId(href: string): string | null {
  const match = href.match(/[?&]annotation=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function CitationMarkdown({
  content,
  targets = {},
  annotationTargets = {},
  showPaperLabel = false,
  sanitizePartial = false,
  onNavigate,
}: CitationMarkdownProps) {
  const normalizedContent = useMemo(
    () => (sanitizePartial ? sanitizePartialMarkdown(content) : content),
    [content, sanitizePartial]
  );

  const rewritten = useMemo(
    () =>
      rewriteCitationMarkdown(
        normalizedContent,
        targets,
        annotationTargets,
        showPaperLabel,
      ),
    [annotationTargets, normalizedContent, targets, showPaperLabel]
  );

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeHighlight, rehypeKatex]}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith("/paper/")) {
            const isAnnotationLink = href.includes("annotation=");

            if (isAnnotationLink) {
              const annotationId = extractAnnotationId(href);
              const target = annotationId ? annotationTargets[annotationId] : undefined;
              if (target) {
                return (
                  <AnnotationPopoverChip target={target}>
                    {children}
                  </AnnotationPopoverChip>
                );
              }
            }

            return (
              <a
                href={href}
                className="citation-chip"
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
