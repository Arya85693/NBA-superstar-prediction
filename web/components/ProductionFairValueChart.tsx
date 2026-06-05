"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatUsd } from "@/lib/format";
import type { ProductionGamePoint } from "@/lib/productionChart";
import { chartLayout, chartLegend, chartTypography } from "@/lib/chartTheme";
import { useChartColors } from "@/lib/useChartColors";

function formatAxisDate(iso: string) {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ProductionTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ProductionGamePoint | undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-border/90 bg-surface-elevated px-3 py-2 shadow-sm">
      <p className="mb-1.5 text-[11px] font-semibold tracking-tight text-charcoal">
        {formatAxisDate(row.date)}
      </p>
      <p className="font-mono text-sm tabular-nums text-foreground">
        GmSc {row.gameScore.toFixed(1)}{" "}
        <span className="text-[11px] font-normal text-muted">production</span>
      </p>
      <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
        {formatUsd(row.fairValue)}{" "}
        <span className="font-sans font-normal text-muted">fair value after game</span>
      </p>
      <p className="mt-1 font-mono text-xs tabular-nums text-muted">
        {row.minutes.toFixed(0)} min
      </p>
    </div>
  );
}

export function ProductionFairValueChart({
  points,
}: {
  points: ProductionGamePoint[];
}) {
  const chartColors = useChartColors();
  const { height, margin, strokeWidth, gridDash, gridOpacity } = chartLayout;
  const plotHeight = height - 8;

  if (points.length === 0) {
    return (
      <p className="rounded-lg border border-border bg-surface px-4 py-6 text-center text-sm text-muted">
        No played games in this window.
      </p>
    );
  }

  const data = points.map((p) => ({
    ...p,
    gs: p.gameScore,
    fair: p.fairValue,
  }));

  return (
    <div
      className="hs-chart-shell w-full min-w-0"
      style={{ height, minHeight: height }}
      role="img"
      aria-label="Game score production with fair value after each game"
    >
      <ResponsiveContainer width="100%" height={plotHeight} debounce={50}>
        <ComposedChart data={data} margin={{ ...margin, right: 52 }}>
          <CartesianGrid
            stroke={chartColors.grid}
            strokeDasharray={gridDash}
            vertical={false}
            opacity={gridOpacity}
          />
          <XAxis
            dataKey="date"
            tick={chartTypography.tick}
            tickLine={false}
            axisLine={{ stroke: chartColors.axis, strokeWidth: 1 }}
            tickFormatter={formatAxisDate}
            interval="preserveStartEnd"
            minTickGap={28}
            dy={4}
          />
          <YAxis
            yAxisId="gs"
            tick={chartTypography.tickMono}
            tickLine={false}
            axisLine={false}
            width={36}
            tickFormatter={(v) => (typeof v === "number" ? v.toFixed(0) : String(v))}
            label={{
              value: "GmSc",
              angle: -90,
              position: "insideLeft",
              offset: 8,
              style: { ...chartTypography.tick, fontSize: 10 },
            }}
          />
          <YAxis
            yAxisId="fair"
            orientation="right"
            tick={chartTypography.tickMono}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v) =>
              typeof v === "number"
                ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : String(v)
            }
            label={{
              value: "Fair value",
              angle: 90,
              position: "insideRight",
              offset: 10,
              style: { ...chartTypography.tick, fontSize: 10 },
            }}
          />
          <Tooltip
            cursor={{ fill: chartColors.cursor, opacity: 0.12 }}
            content={(props) => <ProductionTooltip {...props} />}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={22}
            wrapperStyle={chartLegend.wrapperStyle}
            iconSize={chartLegend.iconSize}
            iconType="plainline"
            formatter={(value) => (
              <span className="text-[11px] font-medium text-muted-foreground">
                {String(value)}
              </span>
            )}
          />
          <Bar
            yAxisId="gs"
            dataKey="gs"
            fill={chartColors.tickMuted}
            fillOpacity={0.55}
            radius={[3, 3, 0, 0]}
            name="Game score"
            isAnimationActive={false}
          />
          <Line
            yAxisId="fair"
            type="monotone"
            dataKey="fair"
            stroke={chartColors.accent}
            strokeWidth={strokeWidth}
            dot={{ r: 2.5, fill: chartColors.accent, strokeWidth: 0 }}
            activeDot={{
              r: 4,
              fill: chartColors.accent,
              stroke: chartColors.surface,
              strokeWidth: 2,
            }}
            name="Fair value"
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
