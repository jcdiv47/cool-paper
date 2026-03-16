"use client";

import { useMemo, useRef, useEffect, type MutableRefObject } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import {
  CitationMarkdown,
  type AnnotationTarget,
  type CitationTarget,
} from "@/components/citation-markdown";
import { parseAnnotationTokens } from "@/lib/annotation-links";
import { parseCitationTokens } from "@/lib/citations";

interface NoteViewerProps {
  paperId: string;
  filename: string;
  /** When provided, citation/annotation link clicks call this instead of navigating. */
  onCitationNavigate?: (href: string) => void;
  /** Shared ref for persisting scroll position across note/split views. */
  scrollTopRef?: MutableRefObject<number>;
}

export function NoteViewer({ paperId, filename, onCitationNavigate, scrollTopRef }: NoteViewerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);

  const note = useQuery(api.notes.get, {
    sanitizedPaperId: paperId,
    filename,
  });
  const noteContent = note?.content || "";

  // Restore scroll position from shared ref once content is loaded
  useEffect(() => {
    if (restoredRef.current || !scrollTopRef?.current || !scrollContainerRef.current) return;
    if (!noteContent) return;
    restoredRef.current = true;
    scrollContainerRef.current.scrollTop = scrollTopRef.current;
  }, [noteContent, scrollTopRef]);

  // Sync scroll position to shared ref
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !scrollTopRef) return;
    const onScroll = () => { scrollTopRef.current = container.scrollTop; };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [scrollTopRef]);
  const citationRefIds = useMemo(
    () =>
      noteContent
        ? [...new Set(parseCitationTokens(noteContent).map((citation) => citation.refId))]
        : [],
    [noteContent]
  );
  const annotationIds = useMemo(
    () =>
      noteContent
        ? [
            ...new Set(
              parseAnnotationTokens(noteContent).map(
                (annotation) => annotation.annotationId
              )
            ),
          ]
        : [],
    [noteContent]
  );
  const citationTargetsResult = useQuery(
    api.paperChunks.resolveBySanitizedId,
    citationRefIds.length > 0
      ? { sanitizedId: paperId, refIds: citationRefIds }
      : "skip"
  );
  const annotationTargetsResult = useQuery(
    api.annotations.resolveBySanitizedId,
    annotationIds.length > 0
      ? { sanitizedId: paperId, annotationIds }
      : "skip"
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
        ])
      ),
    [citationTargetsResult]
  );
  const annotationTargets = useMemo<Record<string, AnnotationTarget>>(
    () =>
      Object.fromEntries(
        (annotationTargetsResult ?? []).map((annotation) => [
          annotation.annotationId,
          {
            annotationId: annotation.annotationId,
            page: annotation.page,
            sanitizedId: annotation.sanitizedId,
            kind: annotation.kind,
            comment: annotation.comment,
          },
        ])
      ),
    [annotationTargetsResult]
  );

  const loading = note === undefined;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollContainerRef} className="min-h-0 flex-1 overflow-y-auto py-4 sm:py-8">
        <div className="mx-auto max-w-3xl px-4 sm:px-8">
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <article className="prose prose-zinc dark:prose-invert max-w-none">
            <CitationMarkdown
              content={noteContent}
              targets={citationTargets}
              annotationTargets={annotationTargets}
              onNavigate={onCitationNavigate}
            />
          </article>
        )}
        </div>
      </div>
    </div>
  );
}
