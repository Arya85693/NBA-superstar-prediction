"use client";

import {
  Area,
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
import type { MarketChartPoint } from "@/lib/marketChart";
import {
  chartLayout,
  chartLegend,
  chartTypography,
} from "@/lib/chartTheme";
import { useChartAccentRgb, useChartColors } from "@/lib/useChartColors";

const MARKET_GRADIENT_ID = "hs-market-area-fill";

function formatAxisDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (iso.includes("T")) {
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTooltipDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  if (iso.includes("T")) {
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PriceTooltip({
  active,
  payload,
  showFairValue,
}: TooltipContentProps & { showFairValue: boolean }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as MarketChartPoint | undefined;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-border/90 bg-surface-elevated px-3 py-2 shadow-sm">
      <p className="mb-1.5 text-[11px] font-semibold tracking-tight text-charcoal">
        {formatTooltipDate(row.date)}
      </p>
      <p className="font-mono text-sm tabular-nums text-foreground">
        {formatUsd(row.marketPrice)}{" "}
        <span className="text-[11px] font-normal text-muted">market</span>
      </p>
      {showFairValue && Math.abs(row.marketPrice - row.fairValue) > 0.0005 ? (
        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
          {formatUsd(row.fairValue)}{" "}
          <span className="font-sans font-normal text-muted">fair value</span>
        </p>
      ) : null}
      {row.hadGame && row.gs != null ? (
        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
          GmSc {row.gs.toFixed(1)}{" "}
          <span className="font-sans font-normal text-muted">that game</span>
        </p>
      ) : null}
    </div>
  );
}

export function PriceChart({
  points,
  showFairValue = true,
}: {
  points: MarketChartPoint[];
  showFairValue?: boolean;
}) {
  if (points.length === 0) {
    return <p className="text-sm text-muted">No history.</p>;
  }

  const chartColors = useChartColors();
  const chartAccentRgb = useChartAccentRgb();
  const { height, margin, yAxisWidth, strokeWidth, gridDash, gridOpacity } = chartLayout;
  const plotHeight = height - 8;

  const chartData = points.map((p) => ({
    ...p,
    market: p.marketPrice,
    fair: p.fairValue,
  }));

  return (
    <div
      className="hs-chart-shell w-full min-w-0"
      style={{ height, minHeight: height }}
      role="img"
      aria-label="Market price over time with fair value reference"
    >
      <ResponsiveContainer width="100%" height={plotHeight} debounce={50}>
        <ComposedChart data={chartData} margin={margin}>
          <defs>
            <linearGradient id={MARKET_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={`rgb(${chartAccentRgb})`}
                stopOpacity={chartLayout.areaFillTop}
              />
              <stop
                offset="92%"
                stopColor={`rgb(${chartAccentRgb})`}
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
            content={(props) => (
              <PriceTooltip {...props} showFairValue={showFairValue} />
            )}
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
          <Area
            type="monotone"
            dataKey="market"
            stroke="none"
            fill={`url(#${MARKET_GRADIENT_ID})`}
            isAnimationActive={false}
            connectNulls
            legendType="none"
          />
          {showFairValue ? (
            <Line
              type="monotone"
              dataKey="fair"
              stroke={chartColors.tickMuted}
              strokeWidth={1.25}
              strokeDasharray="5 4"
              dot={false}
              isAnimationActive={false}
              name="Fair value"
              connectNulls
            />
          ) : null}
          <Line
            type="monotone"
            dataKey="market"
            stroke={chartColors.accent}
            strokeWidth={strokeWidth}
            dot={false}
            activeDot={{
              r: 3.5,
              fill: chartColors.accent,
              stroke: chartColors.surface,
              strokeWidth: 2,
            }}
            isAnimationActive={false}
            name="Market price"
            connectNulls
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
