"use client";

import { useEffect, useRef } from "react";
import "cal-heatmap/cal-heatmap.css";
import type { PaperMetadata } from "@/types";

interface ActivityHeatmapProps {
  papers: PaperMetadata[];
}

export function ActivityHeatmap({ papers }: ActivityHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calRef = useRef<any>(null);

  useEffect(() => {
    let destroyed = false;

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

      // Aggregate papers + notes by day (using unix timestamps in ms)
      const counts: Record<string, number> = {};

      function addDate(isoString: string) {
        // Normalize to midnight UTC for consistent day grouping
        const d = new Date(isoString);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        counts[key] = (counts[key] || 0) + 1;
      }

      papers.forEach((p) => {
        if (p.addedAt) addDate(p.addedAt);
      });

      // Fetch notes for each paper and count by date
      await Promise.all(
        papers.map(async (p) => {
          const sanitizedId = p.arxivId.replace(/\//g, "_");
          try {
            const res = await fetch(`/api/papers/${sanitizedId}/notes`);
            const notes: { modifiedAt: string }[] = await res.json();
            notes.forEach((n) => {
              if (n.modifiedAt) addDate(n.modifiedAt);
            });
          } catch {}
        })
      );

      if (destroyed) return;

      // Convert to array with unix timestamps (seconds) as cal-heatmap expects
      const data = Object.entries(counts).map(([dateStr, value]) => ({
        date: Math.floor(new Date(dateStr).getTime() / 1000),
        value,
      }));

      const cal = new CalHeatmap();
      calRef.current = cal;

      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 11);
      startDate.setDate(1);

      cal.paint(
        {
          data: {
            source: data,
            x: (d: { date: number }) => d.date * 1000,
            y: (d: { value: number }) => d.value,
            groupY: "sum",
          },
          date: { start: startDate },
          range: 12,
          scale: {
            color: {
              type: "threshold",
              range: ["#0e4429", "#006d32", "#26a641", "#39d353"],
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
      className="min-w-0 flex-1 overflow-x-auto rounded-md bg-card p-4 text-foreground"
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
