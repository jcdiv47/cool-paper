"use client";

import { useCallback, useMemo, useRef } from "react";
import { getColorById } from "@/lib/annotation-colors";

interface MinimapAnnotation {
  page: number;
  color?: string;
  kind: "highlight" | "note";
}

interface PdfMinimapProps {
  numPages: number;
  currentPage: number;
  annotations: MinimapAnnotation[];
  /** Fraction of total document visible in viewport (0-1) */
  viewportRatio: number;
  onJumpToPage: (page: number) => void;
}

export function PdfMinimap({
  numPages,
  currentPage,
  annotations,
  viewportRatio,
  onJumpToPage,
}: PdfMinimapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const deduplicatedDots = useMemo(() => {
    const seen = new Set<string>();
    const dots: { page: number; dotColor: string; key: string }[] = [];

    for (const annotation of annotations) {
      const color = getColorById(annotation.color);
      const key = `${annotation.page}:${color.dot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      dots.push({ page: annotation.page, dotColor: color.dot, key });
    }

    return dots;
  }, [annotations]);

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container || numPages === 0) return;

      const rect = container.getBoundingClientRect();
      const relativeY = e.clientY - rect.top;
      const fraction = relativeY / rect.height;
      const targetPage = Math.min(
        numPages,
        Math.max(1, Math.floor(fraction * numPages) + 1),
      );
      onJumpToPage(targetPage);
    },
    [numPages, onJumpToPage],
  );

  if (numPages === 0) return null;

  return (
    <div
      ref={containerRef}
      className="pdf-minimap"
      onClick={handleClick}
    >
      {deduplicatedDots.map((dot) => (
        <div
          key={dot.key}
          className="pdf-minimap-dot"
          style={{
            position: "absolute",
            top: `${((dot.page - 1) / numPages) * 100}%`,
            backgroundColor: dot.dotColor,
          }}
        />
      ))}
    </div>
  );
}
