"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronUp,
  ChevronDown,
  ZoomIn,
  ZoomOut,
  PanelLeft,
  Search,
  X,
  Maximize2,
  Columns2,
  Quote,
  Highlighter,
  StickyNote,
  Trash2,
  PanelRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildPageTextModel,
  cleanPdfText,
  getPageElementFromNode,
  normalizePdfText,
  resolveAnnotationSpanIndexes,
  resolveChunkRefId,
  resolveSelectionAnchor,
  type PageTextModel,
} from "@/lib/pdf-annotations";
import { api } from "../../convex/_generated/api";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const ZOOM_STEP = 25;
const ZOOM_MIN = 25;
const ZOOM_MAX = 500;
const MAX_SELECTION_CHARS = 1200;

interface PdfViewerProps {
  paperId: string;
}

interface PendingSelection {
  page: number;
  exact: string;
  prefix?: string;
  suffix?: string;
  start?: number;
  end?: number;
  chunkRefId?: string;
  rect: {
    top: number;
    left: number;
  };
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveCitationSpanIndexes(
  model: PageTextModel,
  citation: { text: string; prefix?: string },
): number[] {
  // Strategy 1: Full chunk text
  const fullIndexes = resolveAnnotationSpanIndexes(model, { exact: citation.text });
  if (fullIndexes.length > 0) return fullIndexes;

  // Strategy 2: Prefix anchor — locate chunk start via prefix context
  if (citation.prefix) {
    const prefixNorm = normalizePdfText(citation.prefix);
    const prefixPos = model.normalizedText.indexOf(prefixNorm);
    if (prefixPos >= 0) {
      const chunkNorm = normalizePdfText(citation.text);
      const searchStart = prefixPos + prefixNorm.length;
      const nearbyPos = model.normalizedText.indexOf(
        chunkNorm,
        Math.max(0, searchStart - 20),
      );
      if (nearbyPos >= 0) {
        const end = nearbyPos + chunkNorm.length;
        return model.ranges
          .map((range, index) =>
            range.end > nearbyPos && range.start < end ? index : -1,
          )
          .filter((index) => index >= 0);
      }
    }
  }

  // Strategy 3: Progressive fallback — try shorter prefixes of chunk text
  const words = citation.text.split(/\s+/);
  const attempts = [
    Math.ceil(words.length * 0.75),
    Math.ceil(words.length * 0.5),
    Math.ceil(words.length * 0.25),
    12,
  ];
  for (const wordCount of attempts) {
    if (wordCount >= words.length || wordCount < 3) continue;
    const partial = words.slice(0, wordCount).join(" ");
    const indexes = resolveAnnotationSpanIndexes(model, { exact: partial });
    if (indexes.length > 0) return indexes;
  }

  return [];
}

function clearBrowserSelection() {
  window.getSelection()?.removeAllRanges();
}

function annotationKindLabel(kind: "highlight" | "note") {
  return kind === "note" ? "Note" : "Highlight";
}

function annotationToneClass(kind: "highlight" | "note") {
  return kind === "note" ? "pdf-annotation-note" : "pdf-annotation-highlight";
}

export function PdfViewer({ paperId }: PdfViewerProps) {
  const searchParams = useSearchParams();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const router = useRouter();
  const pathname = usePathname();
  const citeRefId = searchParams.get("cite");
  const annotationParam = searchParams.get("annotation");
  const pageParam = searchParams.get("page");

  const paper = useQuery(api.papers.get, { sanitizedId: paperId });
  const createAnnotation = useMutation(api.annotations.create);
  const removeAnnotation = useMutation(api.annotations.remove);

  // Document state
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageDims, setPageDims] = useState({ w: 612, h: 792 });

  // Zoom state
  const [zoom, setZoom] = useState(100);
  const [fitWidth, setFitWidth] = useState(true);

  // UI state
  const [sidebar, setSidebar] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [twoCol, setTwoCol] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [citationBannerOpen, setCitationBannerOpen] = useState(true);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteComment, setNoteComment] = useState("");
  const [pendingSelection, setPendingSelection] =
    useState<PendingSelection | null>(null);
  const [focusedAnnotationId, setFocusedAnnotationId] = useState<string | null>(
    null,
  );
  const [savingAnnotation, setSavingAnnotation] = useState(false);
  const [deletingAnnotationId, setDeletingAnnotationId] = useState<
    string | null
  >(null);

  // Layout measurements
  const [cWidth, setCWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const searchRef = useRef<HTMLInputElement>(null);
  const intersecting = useRef(new Set<number>());
  const highlightedSpansRef = useRef<HTMLElement[]>([]);

  // Virtualization: only render pages near viewport
  const [renderSet, setRenderSet] = useState<Set<number>>(
    () => new Set([1, 2, 3, 4, 5]),
  );

  const focusedCitation = useQuery(
    api.paperChunks.resolveBySanitizedId,
    citeRefId ? { sanitizedId: paperId, refIds: [citeRefId] } : "skip",
  )?.[0];
  const annotationsResult = useQuery(
    api.annotations.listByPaper,
    paper ? { paperId: paper._id } : "skip",
  );
  const annotations = useMemo(
    () =>
      (annotationsResult ?? []).map((annotation) => ({
        ...annotation,
        annotationId: String(annotation._id),
      })),
    [annotationsResult],
  );
  const selectionPage = pendingSelection?.page ?? currentPage;
  const selectionPageChunks = useQuery(
    api.paperChunks.listByPage,
    paper ? { paperId: paper._id, page: selectionPage } : "skip",
  );
  const focusedAnnotation = useMemo(
    () =>
      focusedAnnotationId
        ? annotations.find(
            (annotation) => annotation.annotationId === focusedAnnotationId,
          ) ?? null
        : null,
    [annotations, focusedAnnotationId],
  );
  const annotationsByPage = useMemo(() => {
    const grouped = new Map<number, Array<(typeof annotations)[number]>>();

    for (const annotation of annotations) {
      const bucket = grouped.get(annotation.page);
      if (bucket) {
        bucket.push(annotation);
        continue;
      }
      grouped.set(annotation.page, [annotation]);
    }

    return [...grouped.entries()];
  }, [annotations]);
  const linkedAnnotation = useMemo(
    () =>
      annotationParam
        ? annotations.find(
            (annotation) => annotation.annotationId === annotationParam,
          ) ?? null
        : null,
    [annotationParam, annotations],
  );
  const targetPage = useMemo(() => {
    const parsedPage = pageParam ? parseInt(pageParam, 10) : NaN;
    if (focusedCitation?.page) return focusedCitation.page;
    if (linkedAnnotation?.page) return linkedAnnotation.page;
    return Number.isFinite(parsedPage) ? parsedPage : null;
  }, [focusedCitation?.page, linkedAnnotation?.page, pageParam]);

  // Container sizing — re-attach when document finishes loading
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) =>
      setCWidth(entries[0]!.contentRect.width),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, [numPages]);

  // Rendered page width
  const pageWidth = useMemo(() => {
    if (fitWidth && cWidth > 0) {
      if (twoCol) return Math.min((cWidth - 56) / 2, 700);
      return Math.min(cWidth - 40, 1400);
    }
    return (pageDims.w * zoom) / 100;
  }, [fitWidth, cWidth, zoom, pageDims.w, twoCol]);

  // Page height (uniform assumption — valid for academic papers)
  const pageHeight = useMemo(
    () => pageWidth * (pageDims.h / pageDims.w),
    [pageWidth, pageDims],
  );

  // Display zoom percentage
  const displayZoom = useMemo(() => {
    if (fitWidth && pageDims.w > 0)
      return Math.round((pageWidth / pageDims.w) * 100);
    return zoom;
  }, [fitWidth, pageWidth, pageDims.w, zoom]);

  // Document loaded
  const onDocLoad = useCallback(
    (doc: { numPages: number }) => setNumPages(doc.numPages),
    [],
  );

  const onFirstPage = useCallback(
    (p: { originalWidth: number; originalHeight: number }) =>
      setPageDims({ w: p.originalWidth, h: p.originalHeight }),
    [],
  );

  // Combined observers: page tracking + virtualization
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !numPages) return;
    intersecting.current.clear();

    const pageIo = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const n = Number(e.target.getAttribute("data-pn"));
          if (e.isIntersecting) intersecting.current.add(n);
          else intersecting.current.delete(n);
        }
        if (intersecting.current.size) {
          const min = Math.min(...intersecting.current);
          setCurrentPage(min);
          setPageInput(String(min));
        }
      },
      { root: container, threshold: 0.3 },
    );

    const renderIo = new IntersectionObserver(
      (entries) => {
        setRenderSet((prev) => {
          const next = new Set(prev);
          for (const e of entries) {
            const n = Number(e.target.getAttribute("data-pn"));
            if (e.isIntersecting) next.add(n);
            else next.delete(n);
          }
          return next;
        });
      },
      { root: container, rootMargin: "50% 0px", threshold: 0 },
    );

    pageEls.current.forEach((el) => {
      pageIo.observe(el);
      renderIo.observe(el);
    });

    return () => {
      pageIo.disconnect();
      renderIo.disconnect();
    };
  }, [numPages, pageWidth]);

  // Navigation
  const scrollTo = useCallback((p: number) => {
    pageEls.current
      .get(p)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const goTo = useCallback(
    (p: number) => {
      const clamped = Math.max(1, Math.min(numPages, p));
      setCurrentPage(clamped);
      setPageInput(String(clamped));
      scrollTo(clamped);
    },
    [numPages, scrollTo],
  );

  const clearCitationFocus = useCallback(() => {
    for (const span of highlightedSpansRef.current) {
      span.classList.remove("pdf-citation-focus");
    }
    highlightedSpansRef.current = [];
  }, []);

  const resetSelection = useCallback(() => {
    setPendingSelection(null);
    setNoteComment("");
    clearBrowserSelection();
  }, []);

  const focusAnnotation = useCallback(
    (annotationId: string, page: number) => {
      setFocusedAnnotationId(annotationId);
      setRenderSet((prev) => new Set(prev).add(page));
      resetSelection();
      requestAnimationFrame(() => goTo(page));
    },
    [goTo, resetSelection],
  );

  // Zoom
  const zoomIn = useCallback(() => {
    const base = displayZoom;
    const next = Math.ceil((base + 1) / ZOOM_STEP) * ZOOM_STEP;
    setFitWidth(false);
    setZoom(Math.min(ZOOM_MAX, next));
  }, [displayZoom]);

  const zoomOut = useCallback(() => {
    const base = displayZoom;
    const next = Math.floor((base - 1) / ZOOM_STEP) * ZOOM_STEP;
    setFitWidth(false);
    setZoom(Math.max(ZOOM_MIN, next));
  }, [displayZoom]);

  // Search text renderer
  const textRenderer = useCallback(
    (item: { str: string }) => {
      if (!query || query.length < 2) return item.str;
      try {
        return item.str.replace(
          new RegExp(`(${escapeRegExp(query)})`, "gi"),
          '<mark class="pdf-match">$1</mark>',
        );
      } catch {
        return item.str;
      }
    },
    [query],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "f") {
        e.preventDefault();
        setSearching(true);
        setTimeout(() => searchRef.current?.focus(), 50);
      }
      if (mod && (e.key === "=" || e.key === "+")) {
        e.preventDefault();
        zoomIn();
      }
      if (mod && e.key === "-") {
        e.preventDefault();
        zoomOut();
      }
      if (e.key === "Escape" && searching) {
        setSearching(false);
        setQuery("");
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [searching, zoomIn, zoomOut]);

  // Handle internal PDF link clicks (e.g. references → page 13).
  const onItemClick = useCallback(
    ({ pageNumber }: { pageNumber: number }) => {
      if (!pageNumber) return;
      setCurrentPage(pageNumber);
      setPageInput(String(pageNumber));
      setRenderSet((prev) => new Set(prev).add(pageNumber));
      requestAnimationFrame(() => scrollTo(pageNumber));
    },
    [scrollTo],
  );

  const fileUrl = `/api/papers/${paperId}/pdf`;
  const pages = useMemo(
    () => Array.from({ length: numPages }, (_, i) => i + 1),
    [numPages],
  );

  useEffect(() => {
    if (!numPages || !targetPage) return;
    setRenderSet((prev) => new Set(prev).add(targetPage));
    setCurrentPage(targetPage);
    setPageInput(String(targetPage));
    // When a citation is focused the citation-focus effect will smooth-scroll
    // to the exact span once it resolves.  Scroll to the page instantly here
    // so the user sees the neighbourhood immediately — even if the highlight
    // retry hasn't found the text layer yet.
    requestAnimationFrame(() => {
      pageEls.current
        .get(targetPage)
        ?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  }, [numPages, targetPage]);

  useEffect(() => {
    if (!annotationParam) return;
    if (!linkedAnnotation) return;
    setFocusedAnnotationId(annotationParam);
    setRenderSet((prev) => new Set(prev).add(linkedAnnotation.page));
  }, [annotationParam, linkedAnnotation]);

  useEffect(() => {
    if (focusedCitation) setCitationBannerOpen(true);
  }, [focusedCitation]);

  useEffect(() => {
    clearCitationFocus();
    if (!focusedCitation || !numPages) return;

    let cancelled = false;
    let observer: MutationObserver | null = null;

    const tryHighlight = (): boolean => {
      if (cancelled) return false;

      const pageEl = pageEls.current.get(focusedCitation.page);
      if (!pageEl) return false;

      const model = buildPageTextModel(pageEl);
      if (!model) return false;

      const spanIndexes = resolveCitationSpanIndexes(model, focusedCitation);
      if (spanIndexes.length === 0) return false;

      const matched: HTMLSpanElement[] = [];
      for (const idx of spanIndexes) {
        const span = model.spans[idx];
        if (span) { span.classList.add("pdf-citation-focus"); matched.push(span); }
      }
      highlightedSpansRef.current = matched;
      matched[0]?.scrollIntoView({ behavior: "smooth", block: "center" });
      observer?.disconnect();
      return true;
    };

    let attempts = 0;

    const poll = () => {
      if (cancelled) return;
      if (tryHighlight()) return;

      // Once the page wrapper exists, observe it for text-layer mutations
      // so we react the instant spans appear — even after polling exhausts.
      const pageEl = pageEls.current.get(focusedCitation.page);
      if (pageEl && !observer) {
        observer = new MutationObserver(() => {
          if (cancelled) { observer?.disconnect(); return; }
          tryHighlight();
        });
        observer.observe(pageEl, { childList: true, subtree: true });
      }

      if (attempts < 20) { attempts += 1; window.setTimeout(poll, 150); }
    };

    const rafId = window.requestAnimationFrame(poll);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
      observer?.disconnect();
      clearCitationFocus();
    };
  }, [clearCitationFocus, focusedCitation, numPages, pageWidth]);

  useEffect(() => {
    if (!pendingSelection || pendingSelection.chunkRefId || !selectionPageChunks) {
      return;
    }

    const chunkRefId = resolveChunkRefId(
      selectionPageChunks,
      normalizePdfText(pendingSelection.exact),
      pendingSelection.start,
      pendingSelection.end,
    );

    if (!chunkRefId) return;

    setPendingSelection((current) => {
      if (!current || current.page !== selectionPage || current.chunkRefId) {
        return current;
      }
      return { ...current, chunkRefId };
    });
  }, [pendingSelection, selectionPage, selectionPageChunks]);

  useEffect(() => {
    for (const pageEl of pageEls.current.values()) {
      const annotated = pageEl.querySelectorAll(
        ".pdf-annotation-highlight, .pdf-annotation-note, .pdf-annotation-active",
      );
      for (const node of annotated) {
        if (node instanceof HTMLElement) {
          node.classList.remove(
            "pdf-annotation-highlight",
            "pdf-annotation-note",
            "pdf-annotation-active",
          );
          delete node.dataset.annotationId;
        }
      }
    }

    if (annotationsByPage.length === 0) return;

    let cancelled = false;
    let attempts = 0;

    const applyAnnotations = () => {
      if (cancelled) return;

      let missingTextLayer = false;

      for (const [page, pageAnnotations] of annotationsByPage) {
        const pageEl = pageEls.current.get(page);
        if (!pageEl) continue;

        const model = buildPageTextModel(pageEl);
        if (!model) {
          missingTextLayer = true;
          continue;
        }

        for (const annotation of pageAnnotations) {
          const spanIndexes = resolveAnnotationSpanIndexes(model, annotation);
          for (const index of spanIndexes) {
            const span = model.spans[index];
            if (!span) continue;
            span.classList.add(annotationToneClass(annotation.kind));
            if (annotation.annotationId === focusedAnnotationId) {
              span.classList.add("pdf-annotation-active");
            }
            span.dataset.annotationId = annotation.annotationId;
          }
        }
      }

      if (missingTextLayer && attempts < 12) {
        attempts += 1;
        window.setTimeout(applyAnnotations, 120);
      }
    };

    const rafId = window.requestAnimationFrame(applyAnnotations);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
  }, [annotationsByPage, focusedAnnotationId, pageWidth, renderSet]);

  useEffect(() => {
    if (
      focusedAnnotationId &&
      !annotations.some(
        (annotation) => annotation.annotationId === focusedAnnotationId,
      )
    ) {
      setFocusedAnnotationId(null);
    }
  }, [annotations, focusedAnnotationId]);

  useEffect(() => {
    if (!pendingSelection) return;

    const container = scrollRef.current;
    if (!container) return;

    const clearPending = () => setPendingSelection(null);
    container.addEventListener("scroll", clearPending, { passive: true });
    return () => container.removeEventListener("scroll", clearPending);
  }, [pendingSelection]);

  useEffect(() => {
    setPendingSelection((current) => (current ? null : current));
  }, [pageWidth, twoCol]);

  // In two-column mode, ensure paired pages always render together
  const effectiveRenderSet = useMemo(() => {
    const set = new Set(renderSet);
    if (targetPage) set.add(targetPage);
    if (focusedAnnotation?.page) set.add(focusedAnnotation.page);
    if (!twoCol) return set;
    for (const n of Array.from(set)) {
      const pair = n % 2 === 1 ? n + 1 : n - 1;
      if (pair >= 1 && pair <= numPages) set.add(pair);
    }
    return set;
  }, [focusedAnnotation?.page, numPages, renderSet, targetPage, twoCol]);

  // Group pages into rows (pairs for two-column, singles otherwise)
  const rows = useMemo(() => {
    if (!twoCol) return pages.map((n) => [n]);
    const result: number[][] = [];
    for (let i = 0; i < pages.length; i += 2) {
      result.push(pages.slice(i, i + 2));
    }
    return result;
  }, [pages, twoCol]);

  const captureSelection = useCallback(() => {
    window.setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        setPendingSelection(null);
        return;
      }

      const range = selection.getRangeAt(0);
      const container = scrollRef.current;
      if (!container) return;

      const startPageEl = getPageElementFromNode(range.startContainer);
      const endPageEl = getPageElementFromNode(range.endContainer);
      if (
        !startPageEl ||
        !endPageEl ||
        startPageEl !== endPageEl ||
        !container.contains(startPageEl)
      ) {
        setPendingSelection(null);
        if (cleanPdfText(selection.toString())) {
          toast.error("Highlights must stay within a single page.");
        }
        return;
      }

      const page = Number(startPageEl.getAttribute("data-pn"));
      if (!Number.isFinite(page)) {
        setPendingSelection(null);
        return;
      }

      const exactText = cleanPdfText(selection.toString());
      if (!exactText) {
        setPendingSelection(null);
        return;
      }

      if (exactText.length > MAX_SELECTION_CHARS) {
        setPendingSelection(null);
        clearBrowserSelection();
        toast.error("Selection is too large. Keep highlights under 1200 characters.");
        return;
      }

      const anchor = resolveSelectionAnchor({
        pageElement: startPageEl,
        range,
        exactText,
        pageChunks:
          page === selectionPage && selectionPageChunks
            ? selectionPageChunks
            : undefined,
      });

      if (!anchor) {
        setPendingSelection(null);
        return;
      }

      const rect = range.getBoundingClientRect();
      setPendingSelection({
        page,
        exact: anchor.exact,
        prefix: anchor.prefix,
        suffix: anchor.suffix,
        start: anchor.start,
        end: anchor.end,
        chunkRefId: anchor.chunkRefId,
        rect: {
          top: Math.max(12, rect.top - 12),
          left: Math.max(96, Math.min(window.innerWidth - 96, rect.left + rect.width / 2)),
        },
      });
      setFocusedAnnotationId(null);
      setCurrentPage(page);
      setPageInput(String(page));
    }, 0);
  }, [selectionPage, selectionPageChunks]);

  const handleAnnotationClick = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const annotated = target.closest<HTMLElement>("[data-annotation-id]");
      const annotationId = annotated?.dataset.annotationId;
      if (!annotationId) return;

      const annotation = annotations.find(
        (candidate) => candidate.annotationId === annotationId,
      );
      if (!annotation) return;

      focusAnnotation(annotation.annotationId, annotation.page);
    },
    [annotations, focusAnnotation],
  );

  const saveSelection = useCallback(
    async (kind: "highlight" | "note", comment?: string) => {
      if (!paper?._id || !paper.activeIndexVersion) {
        toast.error("This paper does not have an active evidence index yet.");
        return;
      }

      if (!pendingSelection) return;

      setSavingAnnotation(true);
      try {
        const chunkRefId =
          pendingSelection.chunkRefId ??
          resolveChunkRefId(
            selectionPageChunks,
            normalizePdfText(pendingSelection.exact),
            pendingSelection.start,
            pendingSelection.end,
          );
        const timestamp = new Date().toISOString();
        const createdId = await createAnnotation({
          paperId: paper._id,
          indexVersion: paper.activeIndexVersion,
          kind,
          authorType: "user",
          color: kind === "note" ? "sky" : "amber",
          comment: comment?.trim() || undefined,
          chunkRefId,
          page: pendingSelection.page,
          exact: pendingSelection.exact,
          prefix: pendingSelection.prefix,
          suffix: pendingSelection.suffix,
          start: pendingSelection.start,
          end: pendingSelection.end,
          createdAt: timestamp,
          updatedAt: timestamp,
        });

        setFocusedAnnotationId(String(createdId));
        setNoteDialogOpen(false);
        resetSelection();
        toast.success(
          kind === "note" ? "Annotation note saved." : "Highlight saved.",
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save annotation.",
        );
      } finally {
        setSavingAnnotation(false);
      }
    },
    [createAnnotation, paper, pendingSelection, resetSelection, selectionPageChunks],
  );

  const deleteAnnotation = useCallback(
    async (annotationId: string) => {
      const annotation = annotations.find(
        (candidate) => candidate.annotationId === annotationId,
      );
      if (!annotation) return;

      setDeletingAnnotationId(annotationId);
      try {
        await removeAnnotation({ id: annotation._id });
        if (focusedAnnotationId === annotationId) {
          setFocusedAnnotationId(null);
        }
        toast.success("Annotation removed.");
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to remove annotation.",
        );
      } finally {
        setDeletingAnnotationId(null);
      }
    },
    [annotations, focusedAnnotationId, removeAnnotation],
  );

  return (
    <div className="relative flex h-full flex-col bg-background">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b border-border/40 bg-muted/30 px-2 backdrop-blur-sm">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setSidebar((s) => !s)}
          className={cn(sidebar && "bg-accent")}
          title="Toggle thumbnails"
        >
          <PanelLeft className="h-3.5 w-3.5" />
        </Button>

        <Sep />

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => goTo(currentPage - 1)}
          disabled={currentPage <= 1}
          title="Previous page"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <input
            className="h-5 w-8 rounded border border-border/50 bg-transparent text-center text-xs text-foreground outline-none focus:border-ring"
            value={pageInput}
            onChange={(e) => setPageInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const n = parseInt(pageInput, 10);
                if (!isNaN(n)) goTo(n);
              }
            }}
            onBlur={() => setPageInput(String(currentPage))}
          />
          <span className="select-none">/ {numPages || "\u2013"}</span>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => goTo(currentPage + 1)}
          disabled={currentPage >= numPages}
          title="Next page"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>

        <Sep />

        <Button
          variant="ghost"
          size="icon-xs"
          onClick={zoomOut}
          title="Zoom out"
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <span className="min-w-[3.5ch] select-none text-center text-xs tabular-nums text-muted-foreground">
          {displayZoom}%
        </span>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={zoomIn}
          title="Zoom in"
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setFitWidth((f) => !f)}
          className={cn(fitWidth && "bg-accent")}
          title="Fit to width"
        >
          <Maximize2 className="h-3 w-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setTwoCol((t) => !t)}
          className={cn(twoCol && "bg-accent")}
          title="Two-column view"
        >
          <Columns2 className="h-3.5 w-3.5" />
        </Button>

        <div className="flex-1" />

        {focusedCitation && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => setCitationBannerOpen((prev) => !prev)}
            className={cn(citationBannerOpen && "bg-accent")}
            title="Toggle citation banner"
          >
            <Quote className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="xs"
          onClick={() => setAnnotationsOpen((prev) => !prev)}
          className={cn("gap-1.5", annotationsOpen && "bg-accent")}
          title="Show annotations"
        >
          <Highlighter className="h-3.5 w-3.5" />
          <span>{annotations.length}</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => {
            setSearching((s) => {
              if (!s) setTimeout(() => searchRef.current?.focus(), 50);
              else setQuery("");
              return !s;
            });
          }}
          className={cn(searching && "bg-accent")}
          title="Find in document"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      </div>

      {searching && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/30 bg-muted/20 px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <input
            ref={searchRef}
            className="h-6 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            placeholder="Find in document…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setSearching(false);
                setQuery("");
              }
            }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery("");
                searchRef.current?.focus();
              }}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {focusedCitation && citationBannerOpen && (
        <div className="flex shrink-0 items-start gap-2 border-b border-border/30 border-l-[3px] border-l-primary bg-background px-3 py-2.5 text-sm">
          <Quote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/70">
              Focused Citation · Page {focusedCitation.page}
            </p>
            <p className="line-clamp-2 text-muted-foreground">
              {focusedCitation.text}
            </p>
          </div>
          <button
            onClick={() => setCitationBannerOpen(false)}
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground"
            aria-label="Hide citation banner"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {focusedAnnotation && (
        <div className="flex shrink-0 items-start gap-2 border-b border-border/30 border-l-[3px] border-l-chart-1 bg-background px-3 py-2.5 text-sm">
          <StickyNote className="mt-0.5 h-3.5 w-3.5 shrink-0 text-chart-1" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-chart-1/80">
              {annotationKindLabel(focusedAnnotation.kind)} · Page{" "}
              {focusedAnnotation.page}
            </p>
            {focusedAnnotation.comment && (
              <p className="line-clamp-2 font-medium text-foreground">
                {focusedAnnotation.comment}
              </p>
            )}
            <p className="line-clamp-2 text-muted-foreground">
              {focusedAnnotation.exact}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => void deleteAnnotation(focusedAnnotation.annotationId)}
              disabled={deletingAnnotationId === focusedAnnotation.annotationId}
              className="rounded p-0.5 text-muted-foreground hover:text-destructive disabled:opacity-50"
              aria-label="Delete annotation"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setFocusedAnnotationId(null)}
              className="rounded p-0.5 text-muted-foreground hover:text-foreground"
              aria-label="Clear annotation focus"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      <Document
        file={fileUrl}
        onLoadSuccess={onDocLoad}
        onItemClick={onItemClick}
        loading={<Loader />}
        error={<ErrorMsg />}
        className="flex min-h-0 flex-1 overflow-hidden"
      >
        {sidebar && (
          <div className="w-[140px] shrink-0 overflow-y-auto border-r border-border/30 bg-muted/10 p-2">
            {pages.map((n) => (
              <button
                key={n}
                onClick={() => goTo(n)}
                className={cn(
                  "mb-2 w-full cursor-pointer rounded-md p-1.5 transition-all",
                  currentPage === n
                    ? "bg-accent ring-1 ring-ring/40"
                    : "hover:bg-accent/50",
                )}
              >
                <Page
                  pageNumber={n}
                  width={112}
                  renderTextLayer={false}
                  renderAnnotationLayer={false}
                  className="pointer-events-none"
                />
                <span
                  className={cn(
                    "mt-1 block text-[10px] tabular-nums transition-colors",
                    currentPage === n
                      ? "text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {n}
                </span>
              </button>
            ))}
          </div>
        )}

        <div
          ref={scrollRef}
          onMouseUp={captureSelection}
          onClick={handleAnnotationClick}
          className={cn("flex-1 overflow-auto", isDark && "pdf-dark-pages")}
        >
          {rows.map((row) => (
            <div
              key={row[0]}
              className={cn(
                "flex justify-center py-3 first:pt-4 last:pb-8",
                twoCol && "gap-4",
              )}
            >
              {row.map((n) => (
                <div
                  key={n}
                  ref={(el) => {
                    if (el) pageEls.current.set(n, el);
                    else pageEls.current.delete(n);
                  }}
                  data-pn={n}
                >
                  {effectiveRenderSet.has(n) ? (
                    <div className="pdf-page-shadow">
                      <Page
                        pageNumber={n}
                        width={pageWidth}
                        onLoadSuccess={n === 1 ? onFirstPage : undefined}
                        customTextRenderer={
                          query.length >= 2 ? textRenderer : undefined
                        }
                        loading={
                          <div
                            style={{ width: pageWidth, height: pageHeight }}
                            className="pdf-page-placeholder"
                          />
                        }
                      />
                    </div>
                  ) : (
                    <div
                      style={{ width: pageWidth, height: pageHeight }}
                      className="pdf-page-placeholder"
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>

        {annotationsOpen && (
          <AnnotationsPanel
            annotations={annotations}
            focusedAnnotationId={focusedAnnotationId}
            deletingAnnotationId={deletingAnnotationId}
            onJump={(annotationId, page) => focusAnnotation(annotationId, page)}
            onDelete={(annotationId) => void deleteAnnotation(annotationId)}
            onClose={() => setAnnotationsOpen(false)}
          />
        )}
      </Document>

      {pendingSelection && (
        <div
          className="pdf-selection-toolbar"
          style={{
            top: pendingSelection.rect.top,
            left: pendingSelection.rect.left,
          }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <Button
            size="xs"
            variant="secondary"
            disabled={savingAnnotation}
            onClick={() => void saveSelection("highlight")}
          >
            <Highlighter className="h-3.5 w-3.5" />
            Highlight
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={savingAnnotation}
            onClick={() => setNoteDialogOpen(true)}
          >
            <StickyNote className="h-3.5 w-3.5" />
            Add note
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            disabled={savingAnnotation}
            onClick={resetSelection}
            aria-label="Clear selection"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Annotation Note</DialogTitle>
            <DialogDescription>
              This note stays anchored to the selected text in the PDF.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="max-h-32 overflow-y-auto border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {pendingSelection?.exact}
            </div>
            <Textarea
              value={noteComment}
              onChange={(event) => setNoteComment(event.target.value)}
              placeholder="What matters about this passage?"
              className="min-h-28"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNoteDialogOpen(false)}
              disabled={savingAnnotation}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void saveSelection("note", noteComment)}
              disabled={savingAnnotation || !pendingSelection}
            >
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AnnotationsPanel({
  annotations,
  focusedAnnotationId,
  deletingAnnotationId,
  onJump,
  onDelete,
  onClose,
}: {
  annotations: Array<{
    annotationId: string;
    kind: "highlight" | "note";
    page: number;
    exact: string;
    comment?: string;
    createdAt: string;
  }>;
  focusedAnnotationId: string | null;
  deletingAnnotationId: string | null;
  onJump: (annotationId: string, page: number) => void;
  onDelete: (annotationId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border/30 bg-muted/10">
      <div className="flex h-10 items-center justify-between border-b border-border/30 px-3">
        <div className="flex items-center gap-2">
          <PanelRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Annotations
          </span>
          <span className="text-xs tabular-nums text-muted-foreground/60">
            {annotations.length}
          </span>
        </div>
        <button
          onClick={onClose}
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          aria-label="Close annotations panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-2">
        {annotations.length === 0 ? (
          <div className="border border-dashed border-border/70 bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
            Select text in the PDF to save your first highlight or note.
          </div>
        ) : (
          annotations.map((annotation) => (
            <div
              key={annotation.annotationId}
              onClick={() => onJump(annotation.annotationId, annotation.page)}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onJump(annotation.annotationId, annotation.page);
                }
              }}
              role="button"
              tabIndex={0}
              className={cn(
                "annotation-card w-full text-left",
                focusedAnnotationId === annotation.annotationId &&
                  "annotation-card-active",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn(
                      "inline-block h-2 w-2 shrink-0",
                      annotation.kind === "note"
                        ? "bg-[rgba(73,171,255,0.7)]"
                        : "bg-[rgba(255,204,51,0.8)]",
                    )} />
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {annotationKindLabel(annotation.kind)} · p.{annotation.page}
                    </p>
                  </div>
                  {annotation.comment && (
                    <p className="line-clamp-2 text-xs font-medium text-foreground">
                      {annotation.comment}
                    </p>
                  )}
                  <p className="line-clamp-2 text-xs text-muted-foreground">
                    {annotation.exact}
                  </p>
                </div>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  className="annotation-card-delete shrink-0 opacity-0"
                  disabled={deletingAnnotationId === annotation.annotationId}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(annotation.annotationId);
                  }}
                  aria-label="Delete annotation"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Sep() {
  return <div className="mx-1 h-4 w-px bg-border/50" />;
}

function Loader() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-foreground/70" />
    </div>
  );
}

function ErrorMsg() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
      <p className="text-sm font-medium">Failed to load PDF</p>
      <p className="text-xs text-muted-foreground/60">
        Check that the paper file exists and try again
      </p>
    </div>
  );
}
