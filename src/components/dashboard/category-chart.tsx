"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface CategoryChartProps {
  data: { category: string; count: number }[];
}

// Match the OKLCH chart colors from globals.css as hex approximations
// chart-1: oklch(0.74 0.14 180) ≈ teal
// chart-2: oklch(0.68 0.13 145) ≈ green
// chart-3: oklch(0.70 0.12 300) ≈ purple
// chart-4: oklch(0.70 0.10 60)  ≈ amber
// chart-5: oklch(0.65 0.16 340) ≈ pink
const CHART_COLORS = [
  "oklch(0.74 0.14 180)",
  "oklch(0.68 0.13 145)",
  "oklch(0.70 0.12 300)",
  "oklch(0.70 0.10 60)",
  "oklch(0.65 0.16 340)",
];

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { category: string; count: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const first = payload[0];
  if (!first) return null;
  const data = first.payload;
  return (
    <div className="rounded-xl border border-border/40 bg-card/95 px-3 py-2 text-xs shadow-xl backdrop-blur-xl">
      <span className="font-mono font-medium text-primary">
        {data.category}
      </span>
      <span className="ml-2 text-muted-foreground">
        {data.count} paper{data.count !== 1 ? "s" : ""}
      </span>
    </div>
  );
}

export function CategoryChart({ data }: CategoryChartProps) {
  const top10 = data.slice(0, 10);

  if (top10.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/40 bg-card/60 p-5 backdrop-blur-sm">
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
        Category Landscape
      </h2>
      <div style={{ width: "100%", height: Math.max(top10.length * 32, 120) }}>
        <ResponsiveContainer>
          <BarChart
            data={top10}
            layout="vertical"
            margin={{ top: 0, right: 12, bottom: 0, left: 0 }}
            barCategoryGap="20%"
          >
            <XAxis type="number" hide />
            <YAxis
              type="category"
              dataKey="category"
              width={80}
              tick={{
                fontSize: 11,
                fontFamily: "var(--font-geist-mono), monospace",
                fill: "oklch(0.55 0.01 260)",
              }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ fill: "oklch(1 0 0 / 3%)" }}
            />
            <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={20}>
              {top10.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={CHART_COLORS[index % CHART_COLORS.length]}
                  fillOpacity={0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
