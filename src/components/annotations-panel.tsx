"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  PanelRight,
  X,
  Search,
  Highlighter,
  StickyNote,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  HIGHLIGHT_COLORS,
  getColorById,
  getColorLabel,
} from "@/lib/annotation-colors";

interface AnnotationItem {
  annotationId: string;
  kind: "highlight" | "note";
  color?: string;
  page: number;
  exact: string;
  comment?: string;
  createdAt: string;
}

interface AnnotationsPanelProps {
  annotations: AnnotationItem[];
  focusedAnnotationId: string | null;
  deletingAnnotationId: string | null;
  loading?: boolean;
  onJump: (annotationId: string, page: number) => void;
  onDelete: (annotationId: string) => void;
  onClose: () => void;
}

type KindFilter = "all" | "highlight" | "note";

function annotationKindLabel(kind: "highlight" | "note") {
  return kind === "note" ? "Note" : "Highlight";
}

export function AnnotationsPanel({
  annotations,
  focusedAnnotationId,
  deletingAnnotationId,
  loading = false,
  onJump,
  onDelete,
  onClose,
}: AnnotationsPanelProps) {
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchOpen) {
      searchInputRef.current?.focus();
    }
  }, [searchOpen]);

  /* ---------- filtering ---------- */
  const filtered = useMemo(() => {
    let items = annotations;

    if (kindFilter !== "all") {
      items = items.filter((a) => a.kind === kindFilter);
    }

    if (colorFilter !== null) {
      items = items.filter((a) => a.color === colorFilter);
    }

    if (searchQuery.trim() !== "") {
      const q = searchQuery.trim().toLowerCase();
      items = items.filter(
        (a) =>
          a.exact.toLowerCase().includes(q) ||
          (a.comment?.toLowerCase().includes(q) ?? false),
      );
    }

    return items;
  }, [annotations, kindFilter, colorFilter, searchQuery]);

  /* ---------- group by page ---------- */
  const grouped = useMemo(() => {
    const map = new Map<number, AnnotationItem[]>();
    for (const item of filtered) {
      const list = map.get(item.page);
      if (list) {
        list.push(item);
      } else {
        map.set(item.page, [item]);
      }
    }
    return new Map(
      [...map.entries()].sort(([a], [b]) => a - b),
    );
  }, [filtered]);

  const filtersActive =
    kindFilter !== "all" || colorFilter !== null || searchQuery.trim() !== "";

  /* ---------- render ---------- */
  return (
    <div className="flex w-72 shrink-0 flex-col border-l border-border/30 bg-muted/10">
      {/* ---- header ---- */}
      <div className="flex h-10 items-center justify-between border-b border-border/30 px-3">
        <div className="flex items-center gap-2">
          <PanelRight className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Annotations
          </span>
          <span className="text-xs tabular-nums text-muted-foreground/60">
            {filtersActive
              ? `${filtered.length} / ${annotations.length}`
              : annotations.length}
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

      {/* ---- filter bar ---- */}
      <div className="space-y-1.5 border-b border-border/30 px-2 py-2">
        {/* kind pills + search toggle */}
        <div className="flex items-center gap-1">
          <Button
            size="xs"
            variant="ghost"
            className={cn(kindFilter === "all" && "bg-accent")}
            onClick={() => setKindFilter("all")}
          >
            All
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className={cn(kindFilter === "highlight" && "bg-accent")}
            onClick={() => setKindFilter("highlight")}
          >
            <Highlighter className="h-3 w-3" />
            Highlights
          </Button>
          <Button
            size="xs"
            variant="ghost"
            className={cn(kindFilter === "note" && "bg-accent")}
            onClick={() => setKindFilter("note")}
          >
            <StickyNote className="h-3 w-3" />
            Notes
          </Button>

          <div className="flex-1" />

          <Button
            size="icon-xs"
            variant="ghost"
            className={cn(searchOpen && "bg-accent")}
            onClick={() => {
              setSearchOpen((prev) => !prev);
              if (searchOpen) setSearchQuery("");
            }}
            aria-label="Toggle search"
          >
            <Search className="h-3 w-3" />
          </Button>
        </div>

        {/* color dot row */}
        <div className="flex items-center gap-1">
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.id}
              onClick={() =>
                setColorFilter((prev) =>
                  prev === color.id ? null : color.id,
                )
              }
              className={cn(
                "h-4 w-4 shrink-0 rounded-full transition-all",
                colorFilter === color.id
                  ? "ring-2 ring-ring ring-offset-1 ring-offset-background"
                  : "opacity-60 hover:opacity-100",
              )}
              style={{ backgroundColor: color.dot }}
              aria-label={`Filter by ${color.label}`}
            />
          ))}
        </div>

        {/* compact search input */}
        {searchOpen && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground/60" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search annotations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-7 w-full rounded-md border border-input bg-input/15 pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20"
            />
          </div>
        )}
      </div>

      {/* ---- list ---- */}
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          /* loading skeleton */
          <div className="space-y-1.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="annotation-card animate-shimmer"
              >
                <div className="space-y-2">
                  <div className="h-2 w-24 rounded bg-muted/30" />
                  <div className="h-2 w-full rounded bg-muted/30" />
                  <div className="h-2 w-3/4 rounded bg-muted/30" />
                </div>
              </div>
            ))}
          </div>
        ) : annotations.length === 0 ? (
          /* empty state — no annotations at all */
          <div className="border border-dashed border-border/70 bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
            Select text in the PDF to save your first highlight or note.
          </div>
        ) : filtered.length === 0 ? (
          /* empty state — filters yielded nothing */
          <div className="border border-dashed border-border/70 bg-muted/15 px-4 py-10 text-center text-sm text-muted-foreground">
            No annotations match the current filters.
          </div>
        ) : (
          /* grouped annotation cards */
          <div className="space-y-1.5">
            {[...grouped.entries()].map(([page, items]) => (
              <div key={page}>
                {/* sticky page header */}
                <div className="sticky top-0 z-10 bg-muted/10 px-1 py-1">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/60">
                    Page {page}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {items.map((annotation) => {
                    const colorInfo = getColorById(annotation.color);
                    const isPendingDelete =
                      deletingAnnotationId === annotation.annotationId;

                    return (
                      <div
                        key={annotation.annotationId}
                        onClick={() =>
                          onJump(annotation.annotationId, annotation.page)
                        }
                        onKeyDown={(event) => {
                          if (event.target !== event.currentTarget) return;
                          if (
                            event.key === "Enter" ||
                            event.key === " "
                          ) {
                            event.preventDefault();
                            onJump(
                              annotation.annotationId,
                              annotation.page,
                            );
                          }
                        }}
                        role="button"
                        tabIndex={0}
                        className={cn(
                          "annotation-card w-full text-left",
                          focusedAnnotationId ===
                            annotation.annotationId &&
                            "annotation-card-active",
                          isPendingDelete && "opacity-40",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: colorInfo.dot,
                                }}
                              />
                              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                                {annotationKindLabel(annotation.kind)}{" "}
                                &middot;{" "}
                                {getColorLabel(annotation.color)}{" "}
                                &middot; p.{annotation.page}
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
                            disabled={isPendingDelete}
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
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
