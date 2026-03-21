"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface TimelineDataPoint {
  week: string;
  papersAdded: number;
  threadsCreated: number;
}

interface ResearchTimelineProps {
  data: TimelineDataPoint[];
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const weekDate = label
    ? new Date(label).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      })
    : "";

  return (
    <div className="rounded-xl border border-border/40 bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
      <div className="mb-1 font-medium text-foreground">Week of {weekDate}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-muted-foreground">
            {entry.dataKey === "papersAdded" ? "Papers" : "Chats"}:{" "}
          </span>
          <span className="font-medium text-foreground">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}

function formatWeek(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function ResearchTimeline({ data }: ResearchTimelineProps) {
  if (data.length === 0) return null;

  // Only show every Nth label to avoid crowding
  const labelInterval = Math.max(1, Math.floor(data.length / 6));

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Research Timeline
      </h2>
      <div style={{ width: "100%", height: 200 }}>
        <ResponsiveContainer>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
          >
            <defs>
              <linearGradient id="gradientPapers" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="oklch(0.74 0.14 180)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="oklch(0.74 0.14 180)"
                  stopOpacity={0.02}
                />
              </linearGradient>
              <linearGradient id="gradientThreads" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="oklch(0.68 0.13 145)"
                  stopOpacity={0.3}
                />
                <stop
                  offset="100%"
                  stopColor="oklch(0.68 0.13 145)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="week"
              tickFormatter={formatWeek}
              interval={labelInterval}
              tick={{
                fontSize: 10,
                fill: "oklch(0.45 0.01 260)",
              }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{
                fontSize: 10,
                fill: "oklch(0.45 0.01 260)",
              }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="papersAdded"
              stroke="oklch(0.74 0.14 180)"
              strokeWidth={2}
              fill="url(#gradientPapers)"
            />
            <Area
              type="monotone"
              dataKey="threadsCreated"
              stroke="oklch(0.68 0.13 145)"
              strokeWidth={2}
              fill="url(#gradientThreads)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 text-[10px] text-muted-foreground/60">
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "oklch(0.74 0.14 180)" }} />
          Papers added
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "oklch(0.68 0.13 145)" }} />
          Chats started
        </div>
      </div>
    </div>
  );
}
