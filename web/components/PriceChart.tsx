"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";
import { formatUsd } from "@/lib/format";
import {
  CHART_ACCENT,
  CHART_ACCENT_RGB,
  chartColors,
  chartLayout,
  chartLegend,
  chartTypography,
} from "@/lib/chartTheme";

export type ChartPoint = {
  date: string;
  price: number;
  gs: number | null;
  hadGame: boolean;
};

const GRADIENT_ID = "hs-price-area-fill";

function PriceTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as ChartPoint | undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-border/90 bg-surface-elevated px-3 py-2 shadow-sm">
      <p className="mb-1.5 text-[11px] font-semibold tracking-tight text-charcoal">
        {formatTooltipDate(row.date)}
      </p>
      <p className="font-mono text-sm tabular-nums text-foreground">
        {formatUsd(row.price)}{" "}
        <span className="text-[11px] font-normal text-muted">model price</span>
      </p>
      {row.hadGame && row.gs != null ? (
        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
          GmSc {row.gs.toFixed(1)}{" "}
          <span className="font-sans font-normal text-muted">that game</span>
        </p>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">
          No game logged{" "}
          <span className="text-muted">price carried forward</span>
        </p>
      )}
    </div>
  );
}

function formatAxisDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTooltipDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PriceChart({ points }: { points: ChartPoint[] }) {
  if (points.length === 0) {
    return <p className="text-sm text-muted">No history.</p>;
  }

  const { height, margin, yAxisWidth, strokeWidth, gridDash, gridOpacity } = chartLayout;
  const allSamePrice = points.every((point) => point.price === points[0]?.price);
  const plotHeight = height - 8;

  return (
    <div
      className="hs-chart-shell w-full min-w-0"
      style={{ height, minHeight: height }}
      role="img"
      aria-label="Player model price over time, carried forward by date"
    >
      <ResponsiveContainer width="100%" height={plotHeight} debounce={50}>
        <ComposedChart data={points} margin={margin}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={`rgb(${CHART_ACCENT_RGB})`}
                stopOpacity={chartLayout.areaFillTop}
              />
              <stop
                offset="92%"
                stopColor={`rgb(${CHART_ACCENT_RGB})`}
                stopOpacity={chartLayout.areaFillBottom}
              />
            </linearGradient>
          </defs>
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
            minTickGap={32}
            dy={4}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={chartTypography.tickMono}
            tickLine={false}
            axisLine={false}
            width={yAxisWidth}
            tickFormatter={(v) =>
              typeof v === "number"
                ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : String(v)
            }
          />
          <Tooltip
            cursor={{
              stroke: chartColors.cursor,
              strokeWidth: 1,
              strokeDasharray: "3 4",
            }}
            content={PriceTooltip}
          />
          {allSamePrice && (
            <ReferenceLine
              y={points[0]!.price}
              stroke={CHART_ACCENT}
              strokeOpacity={0.22}
              strokeWidth={1}
              strokeDasharray="4 6"
            />
          )}
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
          <Area
            type="monotone"
            dataKey="price"
            stroke="none"
            fill={`url(#${GRADIENT_ID})`}
            isAnimationActive={false}
            connectNulls
            legendType="none"
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke={CHART_ACCENT}
            strokeWidth={strokeWidth}
            dot={false}
            activeDot={{
              r: 3.5,
              fill: CHART_ACCENT,
              stroke: chartColors.surface,
              strokeWidth: 2,
            }}
            isAnimationActive={false}
            name="Model price"
            connectNulls
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}