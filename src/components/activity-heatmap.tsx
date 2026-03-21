"use client";

import { useEffect, useRef } from "react";
import "cal-heatmap/cal-heatmap.css";
import type { PaperMetadata } from "@/types";

const CACHE_KEY = "activity-heatmap-cache";

interface CachedHeatmap {
  data: { date: number; value: number }[];
  timestamp: number;
}

function readCache(): CachedHeatmap | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(data: { date: number; value: number }[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ data, timestamp: Date.now() }));
  } catch {
    // localStorage unavailable
  }
}

function buildHeatmapData(
  papers: PaperMetadata[]
): { date: number; value: number }[] {
  const counts: Record<string, number> = {};

  function addDate(isoString: string) {
    const d = new Date(isoString);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    counts[key] = (counts[key] || 0) + 1;
  }

  papers.forEach((p) => {
    if (p.addedAt) addDate(p.addedAt);
  });

  return Object.entries(counts).map(([dateStr, value]) => ({
    date: Math.floor(new Date(dateStr).getTime() / 1000),
    value,
  }));
}

interface ActivityHeatmapProps {
  papers: PaperMetadata[];
}

export function ActivityHeatmap({ papers }: ActivityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<{ paint: (...args: unknown[]) => void; destroy: () => void } | null>(null);

  useEffect(() => {
    let destroyed = false;

    // Use cached data for instant render, or build from papers
    const cached = readCache();
    const heatmapData = buildHeatmapData(papers);

    if (heatmapData.length > 0) {
      writeCache(heatmapData);
    }

    const dataToUse = heatmapData.length > 0 ? heatmapData : cached?.data ?? null;
    if (!dataToUse) return;

    async function init() {
      const [
        { default: CalHeatmap },
        { default: Tooltip },
        { default: LegendLite },
        { default: CalendarLabel },
      ] = await Promise.all([
        import("cal-heatmap"),
        import("cal-heatmap/plugins/Tooltip"),
        import("cal-heatmap/plugins/LegendLite"),
        import("cal-heatmap/plugins/CalendarLabel"),
      ]);

      if (destroyed || !containerRef.current || !legendRef.current) return;

      // Destroy previous instance if re-rendering
      calRef.current?.destroy();

      const cal = new CalHeatmap();
      calRef.current = cal;

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 11);
      startDate.setDate(1);

      cal.paint(
        {
          data: {
            source: dataToUse,
            x: (d: { date: number }) => d.date * 1000,
            y: (d: { value: number }) => d.value,
            groupY: "sum",
          },
          date: { start: startDate },
          range: 12,
          scale: {
            color: {
              type: "threshold",
              range: ["#1a1e3a", "#2e3366", "#4a4f99", "#6b72cc"],
              domain: [1, 2, 3],
            },
          },
          domain: {
            type: "month",
            gutter: 4,
            label: {
              text: "MMM",
              textAlign: "start",
              position: "top",
            },
          },
          subDomain: {
            type: "ghDay",
            radius: 2,
            width: 11,
            height: 11,
            gutter: 4,
          },
          itemSelector: containerRef.current,
        },
        [
          [
            Tooltip,
            {
              text: function (
                _date: Date,
                value: number | null,
                dayjsDate: { format: (f: string) => string }
              ) {
                return (
                  (value ? value : "No") +
                  " contributions on " +
                  dayjsDate.format("dddd, MMMM D, YYYY")
                );
              },
            },
          ],
          [
            LegendLite,
            {
              includeBlank: true,
              itemSelector: legendRef.current,
              radius: 2,
              width: 11,
              height: 11,
              gutter: 4,
            },
          ],
          [
            CalendarLabel,
            {
              width: 30,
              textAlign: "start",
              text: () => ["", "Mon", "", "Wed", "", "Fri", ""],
              padding: [25, 0, 0, 0],
            },
          ],
        ]
      );
    }

    init();

    return () => {
      destroyed = true;
      calRef.current?.destroy();
    };
  }, [papers]);

  return (
    <div
      data-theme="dark"
      className="min-w-0 flex-1 overflow-x-auto border border-border bg-card p-4 text-foreground"
    >
      <div ref={containerRef} />
      <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
        <span>Less</span>
        <div ref={legendRef} className="mx-1 inline-block" />
        <span>More</span>
      </div>
    </div>
  );
}
