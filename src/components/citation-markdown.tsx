"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { FileText } from "lucide-react";

export interface CitationTarget {
  refId: string;
  page: number;
  sanitizedId: string;
  section?: string;
  text?: string;
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
  /** The refId of the citation currently being viewed in the PDF. */
  activeCiteRefId?: string;
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

function CitationPopoverChip({
  target,
  href,
  isActive,
  onNavigate,
  children,
}: {
  target: CitationTarget;
  href: string;
  isActive: boolean;
  onNavigate?: (href: string) => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleNavigate = useCallback(() => {
    setOpen(false);
    if (onNavigate) {
      onNavigate(href);
    } else {
      window.location.href = href;
    }
  }, [href, onNavigate]);

  const cancelTimers = useCallback(() => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  }, []);

  // Trigger: mouse enter — open after short delay
  const handleTriggerEnter = useCallback(() => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
    if (!open && !openTimerRef.current) {
      openTimerRef.current = setTimeout(() => { openTimerRef.current = null; setOpen(true); }, 200);
    }
  }, [open]);

  // Trigger: mouse leave — close IMMEDIATELY so border doesn't linger on wrong pill.
  // The popover content is rendered above the trigger, so the mouse will enter the
  // content (and cancel this close via handleContentEnter) before it visually disappears.
  const handleTriggerLeave = useCallback(() => {
    if (openTimerRef.current) { clearTimeout(openTimerRef.current); openTimerRef.current = null; }
    // Tiny delay (30ms) — just enough for the mouse to cross the sideOffset gap
    // into the popover content, but fast enough that the old pill's border clears
    // before the user notices when moving sideways to an adjacent pill.
    closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; setOpen(false); }, 30);
  }, []);

  // Popover content: mouse enter — cancel any pending close
  const handleContentEnter = useCallback(() => {
    if (closeTimerRef.current) { clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  }, []);

  // Popover content: mouse leave — delayed close so user can briefly leave and return
  const handleContentLeave = useCallback(() => {
    closeTimerRef.current = setTimeout(() => { closeTimerRef.current = null; setOpen(false); }, 100);
  }, []);

  useEffect(() => {
    return () => cancelTimers();
  }, [cancelTimers]);

  const previewText = target.text || null;

  return (
    <Popover open={open} onOpenChange={() => {/* controlled entirely by hover timers */}}>
      <PopoverTrigger asChild>
        <a
          href={href}
          className={`citation-chip cursor-pointer${isActive ? " citation-chip-active" : ""}`}
          onMouseEnter={handleTriggerEnter}
          onMouseLeave={handleTriggerLeave}
          onClick={(e) => {
            e.preventDefault();
            handleNavigate();
          }}
        >
          {children}
        </a>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="max-h-80 w-80 overflow-y-auto text-xs"
        onMouseEnter={handleContentEnter}
        onMouseLeave={handleContentLeave}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {previewText && (
          <blockquote className="border-l-2 border-primary/30 pl-3 italic leading-relaxed text-muted-foreground">
            {previewText}
          </blockquote>
        )}
        {!previewText && (
          <p className="text-muted-foreground">No preview available</p>
        )}
        <div className="mt-2 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {target.section ? `${target.section} · ` : ""}p.{target.page}
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
            onClick={(e) => {
              e.stopPropagation();
              handleNavigate();
            }}
          >
            <FileText className="h-3 w-3" />
            View in PDF
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function extractAnnotationId(href: string): string | null {
  const match = href.match(/[?&]annotation=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function extractCiteRefId(href: string): string | null {
  const match = href.match(/[?&]cite=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function CitationMarkdown({
  content,
  targets = {},
  annotationTargets = {},
  showPaperLabel = false,
  sanitizePartial = false,
  onNavigate,
  activeCiteRefId,
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

            // Citation link — check if we have a target with text for popover
            const citeRefId = extractCiteRefId(href);
            const citeTarget = citeRefId ? targets[citeRefId] : undefined;
            const isActive = !!(activeCiteRefId && citeRefId === activeCiteRefId);

            if (citeTarget?.text) {
              return (
                <CitationPopoverChip
                  target={citeTarget}
                  href={href}
                  isActive={isActive}
                  onNavigate={onNavigate}
                >
                  {children}
                </CitationPopoverChip>
              );
            }

            return (
              <a
                href={href}
                className={`citation-chip${isActive ? " citation-chip-active" : ""}`}
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
