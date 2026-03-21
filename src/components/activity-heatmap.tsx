"use client";

import { useEffect, useRef } from "react";
import "cal-heatmap/cal-heatmap.css";

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

interface ActivityHeatmapProps {
  /** Pre-computed heatmap data from the backend (enriched: papers + threads + annotations) */
  data?: { date: number; value: number }[];
}

export function ActivityHeatmap({ data: externalData }: ActivityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const calRef = useRef<{ paint: (...args: unknown[]) => void; destroy: () => void } | null>(null);
  const rangeRef = useRef<number>(0);

  // Cache external data when it arrives
  const heatmapData = externalData ?? [];
  if (heatmapData.length > 0) writeCache(heatmapData);

  useEffect(() => {
    let destroyed = false;

    const cached = readCache();
    const dataToUse = heatmapData.length > 0 ? heatmapData : cached?.data ?? null;
    if (!dataToUse) return;

    let modules: {
      CalHeatmap: typeof import("cal-heatmap")["default"];
      Tooltip: unknown;
      LegendLite: unknown;
      CalendarLabel: unknown;
    } | null = null;

    function getRange() {
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
      if (rangeRef.current === range && calRef.current) return;
      rangeRef.current = range;

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
              domain: [1, 2, 4],
            },
          },
          domain: {
            type: "month",
            gutter: 4,
            label: { text: "MMM", textAlign: "start", position: "top" },
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
                  " activities on " +
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

    function onResize() {
      if (getRange() !== rangeRef.current) paint();
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
