"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronUp,
  ChevronDown,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  PanelLeft,
  Search,
  X,
  Maximize2,
  Highlighter,
  StickyNote,
  Trash2,
  PenLine,
  PanelRight,
  MessageCircle,
  Image,
  List,
  FileText,
  ChevronsDownUp,
  ChevronsUpDown,
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

interface OutlineItem {
  title: string;
  pageNumber: number;
  items: OutlineItem[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveOutline(doc: any): Promise<OutlineItem[]> {
  const raw = await doc.getOutline();
  if (!raw) return [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function resolve(items: any[]): Promise<OutlineItem[]> {
    const result: OutlineItem[] = [];
    for (const item of items) {
      let pageNumber = 1;
      try {
        let dest = item.dest;
        if (typeof dest === "string") {
          dest = await doc.getDestination(dest);
        }
        if (Array.isArray(dest) && dest[0]) {
          const pageIndex = await doc.getPageIndex(dest[0]);
          pageNumber = pageIndex + 1;
        }
      } catch {
        // fallback to page 1 if resolution fails
      }
      const children = item.items?.length ? await resolve(item.items) : [];
      result.push({ title: item.title, pageNumber, items: children });
    }
    return result;
  }

  return resolve(raw);
}

interface PdfViewerProps {
  paperId: string;
  onToggleChat?: () => void;
  chatOpen?: boolean;
  /** Called when user clicks "Back to chat" after navigating to a citation. */
  onReturnToChat?: (refId: string) => void;
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

/* ---------- Outline / TOC tree component ---------- */

function OutlineTree({
  items,
  currentPage,
  goTo,
  depth = 0,
  defaultExpanded,
}: {
  items: OutlineItem[];
  currentPage: number;
  goTo: (page: number) => void;
  depth?: number;
  defaultExpanded?: boolean;
}) {
  return (
    <div className={depth > 0 ? "ml-3" : ""}>
      {items.map((item, i) => (
        <OutlineNode key={`${depth}-${i}`} item={item} currentPage={currentPage} goTo={goTo} depth={depth} defaultExpanded={defaultExpanded} />
      ))}
    </div>
  );
}

function OutlineNode({
  item,
  currentPage,
  goTo,
  depth,
  defaultExpanded,
}: {
  item: OutlineItem;
  currentPage: number;
  goTo: (page: number) => void;
  depth: number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? depth < 1);
  const hasChildren = item.items.length > 0;

  // Determine if this item (or any descendant) covers the current page
  const isActive = item.pageNumber === currentPage;

  return (
    <div>
      <div className="flex items-start gap-0.5">
        {hasChildren ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-accent/50"
          >
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform",
                expanded && "rotate-90",
              )}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <button
          onClick={() => goTo(item.pageNumber)}
          className={cn(
            "flex-1 rounded-sm px-1.5 py-1 text-left text-[12px] leading-snug transition-colors",
            isActive
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/40",
          )}
          title={`${item.title} — Page ${item.pageNumber}`}
        >
          {item.title}
        </button>
      </div>
      {hasChildren && expanded && (
        <OutlineTree items={item.items} currentPage={currentPage} goTo={goTo} depth={depth + 1} defaultExpanded={defaultExpanded} />
      )}
    </div>
  );
}

function annotationKindLabel(kind: "highlight" | "note") {
  return kind === "note" ? "Note" : "Highlight";
}

function annotationToneClass(kind: "highlight" | "note") {
  return kind === "note" ? "pdf-annotation-note" : "pdf-annotation-highlight";
}

export function PdfViewer({
  paperId,
  onToggleChat,
  chatOpen,
  onReturnToChat,
}: PdfViewerProps) {
  const searchParams = useSearchParams();
  const citeRefId = searchParams.get("cite");
  const annotationParam = searchParams.get("annotation");
  const pageParam = searchParams.get("page");

  const paper = useQuery(api.papers.get, { sanitizedId: paperId });
  const createAnnotation = useMutation(api.annotations.create);
  const updateAnnotation = useMutation(api.annotations.update);
  const removeAnnotation = useMutation(api.annotations.remove);

  // Document state
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageDims, setPageDims] = useState({ w: 612, h: 792 });

  // Zoom state
  const [zoom, setZoom] = useState(100);
  const [fitMode, setFitMode] = useState<"width" | "height" | null>("height");

  // Outline / TOC
  const [outline, setOutline] = useState<OutlineItem[]>([]);

  // UI state
  const [sidebar, setSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"thumbnails" | "outline">("thumbnails");
  // Bump generation to force re-mount OutlineTree with a new defaultExpanded
  const [outlineGen, setOutlineGen] = useState(0);
  const [outlineExpanded, setOutlineExpanded] = useState(true); // current default for all nodes
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [twoCol, setTwoCol] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editComment, setEditComment] = useState("");
  const [editingAnnotationId, setEditingAnnotationId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    annotationId: string;
  } | null>(null);
  const [annotationDetail, setAnnotationDetail] = useState<{
    x: number;
    y: number;
    annotationId: string;
  } | null>(null);
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
  const [cHeight, setCHeight] = useState(0);
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
  const selectionPageRef = useRef(selectionPage);
  const selectionPageChunksRef = useRef(selectionPageChunks);

  useEffect(() => {
    selectionPageRef.current = selectionPage;
    selectionPageChunksRef.current = selectionPageChunks;
  }, [selectionPage, selectionPageChunks]);

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
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]!.contentRect;
      setCWidth(rect.width);
      setCHeight(rect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [numPages]);

  // Rendered page width
  const pageWidth = useMemo(() => {
    if (fitMode === "width" && cWidth > 0) {
      if (twoCol) return Math.min((cWidth - 56) / 2, 700);
      return Math.min(cWidth - 40, 1400);
    }
    if (fitMode === "height" && cHeight > 0 && pageDims.h > 0) {
      const fitH = cHeight - 16; // small padding
      return fitH * (pageDims.w / pageDims.h);
    }
    return (pageDims.w * zoom) / 100;
  }, [fitMode, cWidth, cHeight, zoom, pageDims.w, pageDims.h, twoCol]);

  // Page height (uniform assumption — valid for academic papers)
  const pageHeight = useMemo(
    () => pageWidth * (pageDims.h / pageDims.w),
    [pageWidth, pageDims],
  );

  // Display zoom percentage
  const displayZoom = useMemo(() => {
    if (fitMode && pageDims.w > 0)
      return Math.round((pageWidth / pageDims.w) * 100);
    return zoom;
  }, [fitMode, pageWidth, pageDims.w, zoom]);

  // Document loaded
  const onDocLoad = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc: any) => {
      setNumPages(doc.numPages);
      resolveOutline(doc).then(setOutline).catch(() => setOutline([]));
    },
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
    setFitMode(null);
    setZoom(Math.min(ZOOM_MAX, next));
  }, [displayZoom]);

  const zoomOut = useCallback(() => {
    const base = displayZoom;
    const next = Math.floor((base - 1) / ZOOM_STEP) * ZOOM_STEP;
    setFitMode(null);
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

  // PDF URL from Convex storage
  const pdfStorageUrl = useQuery(
    api.papers.getPdfUrl,
    paper?.pdfStorageId ? { storageId: paper.pdfStorageId } : "skip",
  );
  const fileUrl = pdfStorageUrl ?? null;
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

  // Close context menu on click/scroll anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [contextMenu]);

  // Close annotation detail on click or scroll outside
  useEffect(() => {
    if (!annotationDetail) return;
    const close = (e: Event) => {
      const target = e.target;
      if (target instanceof Element && target.closest?.("[data-annotation-detail]")) return;
      setAnnotationDetail(null);
    };
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [annotationDetail]);

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

      const curSelectionPage = selectionPageRef.current;
      const curSelectionPageChunks = selectionPageChunksRef.current;

      const anchor = resolveSelectionAnchor({
        pageElement: startPageEl,
        range,
        exactText,
        pageChunks:
          page === curSelectionPage && curSelectionPageChunks
            ? curSelectionPageChunks
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
  }, []);

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

      setAnnotationDetail({ x: event.clientX, y: event.clientY, annotationId });
      event.stopPropagation();
    },
    [annotations],
  );

  const handleAnnotationContextMenu = useCallback(
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

      event.preventDefault();
      event.stopPropagation();
      setContextMenu({ x: event.clientX, y: event.clientY, annotationId });
    },
    [annotations],
  );

  const openEditDialog = useCallback(
    (annotationId: string) => {
      const annotation = annotations.find(
        (candidate) => candidate.annotationId === annotationId,
      );
      if (!annotation) return;
      setEditingAnnotationId(annotationId);
      setEditComment(annotation.comment ?? "");
      setEditDialogOpen(true);
      setContextMenu(null);
    },
    [annotations],
  );

  const saveEditAnnotation = useCallback(async () => {
    if (!editingAnnotationId) return;
    const annotation = annotations.find(
      (candidate) => candidate.annotationId === editingAnnotationId,
    );
    if (!annotation) return;

    try {
      await updateAnnotation({
        id: annotation._id,
        comment: editComment.trim() || undefined,
        updatedAt: new Date().toISOString(),
      });
      setEditDialogOpen(false);
      setEditingAnnotationId(null);
      toast.success("Annotation updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update annotation.",
      );
    }
  }, [annotations, editComment, editingAnnotationId, updateAnnotation]);

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
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-border/40 bg-card/80 px-2 backdrop-blur-md">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setSidebar((s) => !s)}
          className={cn(sidebar && "bg-accent")}
          title="Toggle sidebar"
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
            className="h-5 w-8 rounded-[3px] border border-border/50 bg-transparent text-center text-xs text-foreground outline-none focus:border-ring"
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className={cn((fitMode || twoCol) && "bg-accent")}
              title="View options"
            >
              <Maximize2 className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" side="top" className="min-w-[10rem]">
            <DropdownMenuRadioGroup
              value={fitMode ?? "none"}
              onValueChange={(v) =>
                setFitMode(v === "none" ? null : (v as "width" | "height"))
              }
            >
              <DropdownMenuRadioItem value="height">
                Fit to height
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="width">
                Fit to width
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="none">
                Manual zoom
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={twoCol}
              onCheckedChange={() => setTwoCol((t) => !t)}
            >
              Two-column view
            </DropdownMenuCheckboxItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

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
        {onToggleChat && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onToggleChat}
            className={cn(chatOpen && "bg-accent")}
            title="Toggle chat (C)"
          >
            <MessageCircle className="h-3.5 w-3.5" />
          </Button>
        )}
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

      <Document
        file={fileUrl}
        onLoadSuccess={onDocLoad}
        onItemClick={onItemClick}
        loading={<Loader />}
        error={<ErrorMsg />}
        className="flex min-h-0 flex-1 overflow-hidden"
      >
        {sidebar && (
          <div className={cn(
            "shrink-0 flex flex-col border-r border-border/30 bg-muted/10",
            sidebarTab === "outline" ? "w-[260px]" : "w-[140px]",
          )}>
            {/* Sidebar tab switcher */}
            <div className="flex shrink-0 border-b border-border/30">
              <button
                onClick={() => setSidebarTab("thumbnails")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] transition-colors",
                  sidebarTab === "thumbnails"
                    ? "bg-accent/60 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
                )}
                title="Page thumbnails"
              >
                <Image className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setSidebarTab("outline")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-1.5 py-1.5 text-[11px] transition-colors",
                  sidebarTab === "outline"
                    ? "bg-accent/60 text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/30",
                )}
                title="Table of contents"
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Sidebar content */}
            <div className="flex-1 overflow-y-auto p-2">
              {sidebarTab === "thumbnails" ? (
                pages.map((n) => (
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
                ))
              ) : outline.length > 0 ? (
                <>
                  <div className="mb-1.5 flex items-center justify-end">
                    <button
                      onClick={() => {
                        const next = !outlineExpanded;
                        setOutlineExpanded(next);
                        setOutlineGen((g) => g + 1);
                      }}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                      title={outlineExpanded ? "Collapse all" : "Expand all"}
                    >
                      {outlineExpanded ? (
                        <ChevronsDownUp className="h-3 w-3" />
                      ) : (
                        <ChevronsUpDown className="h-3 w-3" />
                      )}
                      <span>{outlineExpanded ? "Collapse" : "Expand"}</span>
                    </button>
                  </div>
                  <OutlineTree key={outlineGen} items={outline} currentPage={currentPage} goTo={goTo} defaultExpanded={outlineExpanded} />
                </>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
                  <FileText className="h-6 w-6 opacity-40" />
                  <span className="text-xs">No table of contents</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div
          ref={scrollRef}
          onMouseUp={captureSelection}
          onClick={handleAnnotationClick}
          onContextMenu={handleAnnotationContextMenu}
          className="flex-1 overflow-auto pdf-dark-pages"
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

      {contextMenu && (
        <div
          className="fixed z-50 min-w-[140px] rounded-md border border-border bg-popover p-1 shadow-md"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
            onClick={() => openEditDialog(contextMenu.annotationId)}
          >
            <PenLine className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10"
            disabled={deletingAnnotationId === contextMenu.annotationId}
            onClick={() => {
              void deleteAnnotation(contextMenu.annotationId);
              setContextMenu(null);
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      )}

      {annotationDetail && (() => {
        const ann = annotations.find((a) => a.annotationId === annotationDetail.annotationId);
        if (!ann?.comment) return null;
        return (
          <div
            data-annotation-detail
            className="fixed z-50 max-h-64 w-80 overflow-y-auto rounded-md border border-border bg-popover p-3 shadow-md"
            style={{ top: annotationDetail.y, left: annotationDetail.x }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-foreground">{ann.comment}</p>
          </div>
        );
      })()}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Annotation</DialogTitle>
            <DialogDescription>
              Update the comment on this annotation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {editingAnnotationId && (() => {
              const ann = annotations.find((a) => a.annotationId === editingAnnotationId);
              return ann ? (
                <div className="max-h-32 overflow-y-auto border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  {ann.exact}
                </div>
              ) : null;
            })()}
            <Textarea
              value={editComment}
              onChange={(event) => setEditComment(event.target.value)}
              placeholder="Add or update your comment..."
              className="min-h-28"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button onClick={() => void saveEditAnnotation()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* "Back to chat" floating pill — shown when viewing a citation from chat */}
      {citeRefId && onReturnToChat && (
        <button
          type="button"
          className="fixed bottom-6 left-1/2 z-40 -translate-x-1/2 inline-flex items-center gap-2 rounded-full border border-border/50 bg-background/90 px-4 py-2 text-sm font-medium shadow-lg backdrop-blur-xl transition-all hover:bg-primary/10 hover:border-primary/40 hover:shadow-primary/10"
          onClick={() => onReturnToChat(citeRefId)}
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Back to chat
        </button>
      )}
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
