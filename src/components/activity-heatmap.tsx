"use client";

import { useEffect, useMemo, useRef } from "react";
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

  // Track the current range so we only re-render when the breakpoint changes
  const rangeRef = useRef<number>(0);

  // Derive a stable key from addedAt dates only — the sole field the heatmap
  // uses.  During import the importStatus changes but addedAt stays the same,
  // so the memoised data keeps its reference and the effect won't re-run.
  const addedAtKey = useMemo(
    () =>
      papers
        .map((p) => p.addedAt ?? "")
        .sort()
        .join(","),
    [papers]
  );

  const heatmapData = useMemo(() => {
    const data = buildHeatmapData(papers);
    if (data.length > 0) writeCache(data);
    return data;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed by addedAt values
  }, [addedAtKey]);

  useEffect(() => {
    let destroyed = false;

    // Use cached data for instant render, or built from papers
    const cached = readCache();

    const dataToUse = heatmapData.length > 0 ? heatmapData : cached?.data ?? null;
    if (!dataToUse) return;

    // Modules loaded once, reused on resize
    let modules: {
      CalHeatmap: typeof import("cal-heatmap")["default"];
      Tooltip: unknown;
      LegendLite: unknown;
      CalendarLabel: unknown;
    } | null = null;

    function getRange() {
      // lg breakpoint = 1024px (Tailwind default)
      return window.innerWidth >= 1024 ? 10 : 5;
    }

    async function paint() {
      if (!modules) {
        const [ch, tt, ll, cl] = await Promise.all([
          import("cal-heatmap"),
          import("cal-heatmap/plugins/Tooltip"),
          import("cal-heatmap/plugins/LegendLite"),
          import("cal-heatmap/plugins/CalendarLabel"),
        ]);
        modules = {
          CalHeatmap: ch.default,
          Tooltip: tt.default,
          LegendLite: ll.default,
          CalendarLabel: cl.default,
        };
      }

      if (destroyed || !containerRef.current || !legendRef.current) return;

      const range = getRange();

      // Skip if breakpoint hasn't changed
      if (rangeRef.current === range && calRef.current) return;
      rangeRef.current = range;

      // Destroy previous instance
      calRef.current?.destroy();

      const { CalHeatmap, Tooltip, LegendLite, CalendarLabel } = modules;

      const cal = new CalHeatmap();
      calRef.current = cal;

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - (range - 1));
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
          range,
          scale: {
            color: {
              type: "threshold",
              range: ["#132a2a", "#1a4040", "#257070", "#35b0a0"],
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
            radius: 3,
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
              radius: 3,
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

    paint();

    // Re-paint when crossing the breakpoint on resize
    function onResize() {
      const newRange = getRange();
      if (newRange !== rangeRef.current) {
        paint();
      }
    }

    window.addEventListener("resize", onResize);

    return () => {
      destroyed = true;
      window.removeEventListener("resize", onResize);
      calRef.current?.destroy();
      calRef.current = null;
      rangeRef.current = 0;
    };
  }, [heatmapData]);

  return (
    <div
      data-theme="dark"
      className="min-w-0 overflow-x-auto rounded-xl border border-border/40 bg-card/60 p-5 text-foreground backdrop-blur-sm"
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
