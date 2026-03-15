"use client";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { cn } from "@/lib/utils";

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

const ZOOM_STEP = 25;
const ZOOM_MIN = 25;
const ZOOM_MAX = 500;

interface PdfViewerProps {
  paperId: string;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function PdfViewer({ paperId }: PdfViewerProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

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

  // Layout measurements
  const [cWidth, setCWidth] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const searchRef = useRef<HTMLInputElement>(null);
  const intersecting = useRef(new Set<number>());

  // Virtualization: only render pages near viewport
  const [renderSet, setRenderSet] = useState<Set<number>>(
    () => new Set([1, 2, 3, 4, 5]),
  );

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

    // Tracks which page the user is reading (small threshold, no margin)
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

    // Tracks which pages should be rendered (generous buffer)
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
  // Must be stable (no deps) because react-pdf's viewer ref captures
  // onItemClick from the first render via a stale useRef closure.
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

  // In two-column mode, ensure paired pages always render together
  const effectiveRenderSet = useMemo(() => {
    if (!twoCol) return renderSet;
    const set = new Set(renderSet);
    for (const n of renderSet) {
      const pair = n % 2 === 1 ? n + 1 : n - 1;
      if (pair >= 1 && pair <= numPages) set.add(pair);
    }
    return set;
  }, [renderSet, twoCol, numPages]);

  // Group pages into rows (pairs for two-column, singles otherwise)
  const rows = useMemo(() => {
    if (!twoCol) return pages.map((n) => [n]);
    const result: number[][] = [];
    for (let i = 0; i < pages.length; i += 2) {
      result.push(pages.slice(i, i + 2));
    }
    return result;
  }, [pages, twoCol]);

  return (
    <div className="flex h-full flex-col bg-background">
      {/* ── toolbar ── */}
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

        {/* page navigation */}
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

        {/* zoom controls */}
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

        {/* search toggle */}
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

      {/* ── search bar ── */}
      {searching && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border/30 bg-muted/20 px-3">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
          <input
            ref={searchRef}
            className="h-6 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/50"
            placeholder="Find in document\u2026"
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

      {/* ── content ── */}
      <Document
        file={fileUrl}
        onLoadSuccess={onDocLoad}
        onItemClick={onItemClick}
        loading={<Loader />}
        error={<ErrorMsg />}
        className="flex min-h-0 flex-1 overflow-hidden"
      >
        {/* thumbnail sidebar */}
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

        {/* pages scroll area */}
        <div
          ref={scrollRef}
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
      </Document>
    </div>
  );
}

/* ── small helpers ── */

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
