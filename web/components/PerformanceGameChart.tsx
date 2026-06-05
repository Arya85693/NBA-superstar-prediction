"use client";

import { useMemo } from "react";
import {
  Area,
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
import type { ChartRange, MarketChartPoint } from "@/lib/marketChart";
import { chartLayout, chartLegend, chartTypography } from "@/lib/chartTheme";
import { useChartAccentRgb, useChartColors } from "@/lib/useChartColors";

const FILL_GRADIENT_ID = "hs-performance-area-fill";
const WEEK_SPARK_GRADIENT_ID = "hs-week-spark-fill";

type EnrichedPoint = MarketChartPoint & {
  price: number;
  gmsc: number;
  priceDelta: number | null;
  moveUp: boolean | null;
  shortDate: string;
};

function formatAxisDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatShortDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
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

function enrichPoints(points: MarketChartPoint[]): EnrichedPoint[] {
  return points.map((p, i) => {
    const prev = i > 0 ? points[i - 1]!.marketPrice : null;
    const priceDelta = prev != null ? p.marketPrice - prev : null;
    return {
      ...p,
      price: p.marketPrice,
      gmsc: p.gs ?? 0,
      priceDelta,
      moveUp: priceDelta == null ? null : priceDelta >= 0,
      shortDate: formatShortDate(p.date),
    };
  });
}

function computeStats(data: EnrichedPoint[]) {
  if (data.length < 2) return null;
  const first = data[0]!.price;
  const last = data[data.length - 1]!.price;
  let bestJump = -Infinity;
  let worstJump = Infinity;
  for (let i = 1; i < data.length; i++) {
    const d = data[i]!.priceDelta ?? 0;
    if (d > bestJump) bestJump = d;
    if (d < worstJump) worstJump = d;
  }
  return {
    change: last - first,
    games: data.length,
    bestJump: Number.isFinite(bestJump) ? bestJump : 0,
    worstJump: Number.isFinite(worstJump) ? worstJump : 0,
  };
}

function PerformanceTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as EnrichedPoint | undefined;
  if (!row) return null;

  const deltaTone =
    row.priceDelta == null
      ? "text-muted-foreground"
      : row.priceDelta > 0
        ? "text-positive"
        : row.priceDelta < 0
          ? "text-negative"
          : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border/90 bg-surface-elevated px-3.5 py-2.5 shadow-md">
      <p className="text-[11px] font-semibold tracking-tight text-charcoal">
        {formatTooltipDate(row.date)}
      </p>
      <p className="mt-1.5 font-mono text-sm tabular-nums text-foreground">
        {formatUsd(row.price)}{" "}
        <span className="font-sans text-[11px] font-normal text-muted">fair value</span>
      </p>
      {row.priceDelta != null ? (
        <p className={`mt-1 font-mono text-xs tabular-nums ${deltaTone}`}>
          {row.priceDelta >= 0 ? "+" : ""}
          {formatUsd(row.priceDelta)}{" "}
          <span className="font-sans font-normal text-muted">vs prior game</span>
        </p>
      ) : null}
      {row.gs != null ? (
        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
          GmSc {row.gs.toFixed(1)}
        </p>
      ) : null}
    </div>
  );
}

function StatsStrip({ stats, compact = false }: { stats: ReturnType<typeof computeStats>; compact?: boolean }) {
  if (!stats) return null;

  if (compact) {
    return (
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Week move
          </dt>
          <dd
            className={`mt-1 font-mono text-sm tabular-nums ${
              stats.change > 0
                ? "text-positive"
                : stats.change < 0
                  ? "text-negative"
                  : "text-foreground"
            }`}
          >
            {stats.change >= 0 ? "+" : ""}
            {formatUsd(stats.change)}
          </dd>
        </div>
        <div className="rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5">
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Games played
          </dt>
          <dd className="mt-1 font-mono text-sm tabular-nums text-foreground">
            {stats.games}
          </dd>
        </div>
      </dl>
    );
  }

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <div className="rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Period move
        </dt>
        <dd
          className={`mt-1 font-mono text-sm tabular-nums ${
            stats.change > 0
              ? "text-positive"
              : stats.change < 0
                ? "text-negative"
                : "text-foreground"
          }`}
        >
          {stats.change >= 0 ? "+" : ""}
          {formatUsd(stats.change)}
        </dd>
      </div>
      <div className="rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Games
        </dt>
        <dd className="mt-1 font-mono text-sm tabular-nums text-foreground">
          {stats.games}
        </dd>
      </div>
      <div className="rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Best night
        </dt>
        <dd className="mt-1 font-mono text-sm tabular-nums text-positive">
          +{formatUsd(stats.bestJump)}
        </dd>
      </div>
      <div className="rounded-xl border border-border/70 bg-surface/80 px-3 py-2.5">
        <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted">
          Worst night
        </dt>
        <dd className="mt-1 font-mono text-sm tabular-nums text-negative">
          {formatUsd(stats.worstJump)}
        </dd>
      </div>
    </dl>
  );
}

function PerformanceWeekView({ data }: { data: EnrichedPoint[] }) {
  const chartColors = useChartColors();
  const chartAccentRgb = useChartAccentRgb();
  const stats = computeStats(data);
  const sparkHeight = 168;

  const priceMin = Math.min(...data.map((d) => d.price));
  const priceMax = Math.max(...data.map((d) => d.price));
  const pricePad = Math.max(1.5, (priceMax - priceMin) * 0.18 || 3);

  return (
    <div className="space-y-4">
      <StatsStrip stats={stats} compact />

      <ul className="space-y-2">
        {[...data].reverse().map((game) => {
          const deltaTone =
            game.priceDelta == null
              ? "text-muted-foreground"
              : game.priceDelta > 0
                ? "text-positive"
                : game.priceDelta < 0
                  ? "text-negative"
                  : "text-muted-foreground";

          return (
            <li
              key={game.date}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-surface/90 px-3.5 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{game.shortDate}</p>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-muted">
                  GmSc {game.gs?.toFixed(1) ?? "—"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-mono text-sm tabular-nums text-foreground">
                  {formatUsd(game.price)}
                </p>
                {game.priceDelta != null ? (
                  <p className={`mt-0.5 font-mono text-xs tabular-nums ${deltaTone}`}>
                    {game.priceDelta >= 0 ? "+" : ""}
                    {formatUsd(game.priceDelta)}
                  </p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted">Season opener</p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {data.length >= 2 ? (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted">
            Week trend
          </p>
          <div
            className="hs-chart-shell rounded-xl border border-border/70 bg-surface/60 px-1 py-2"
            style={{ height: sparkHeight, minHeight: sparkHeight }}
          >
            <ResponsiveContainer width="100%" height={sparkHeight - 8} debounce={50}>
              <ComposedChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id={WEEK_SPARK_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={`rgb(${chartAccentRgb})`}
                      stopOpacity={0.2}
                    />
                    <stop
                      offset="100%"
                      stopColor={`rgb(${chartAccentRgb})`}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="shortDate"
                  tick={{ ...chartTypography.tick, fontSize: 9 }}
                  tickLine={false}
                  axisLine={{ stroke: chartColors.axis, strokeWidth: 1 }}
                  interval={0}
                  height={32}
                />
                <YAxis
                  domain={[priceMin - pricePad, priceMax + pricePad]}
                  hide
                />
                <Tooltip content={(props) => <PerformanceTooltip {...props} />} />
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke="none"
                  fill={`url(#${WEEK_SPARK_GRADIENT_ID})`}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke={chartColors.accent}
                  strokeWidth={2}
                  dot={{
                    r: 4,
                    fill: chartColors.accent,
                    stroke: chartColors.surface,
                    strokeWidth: 2,
                  }}
                  activeDot={{ r: 5, strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PerformanceFullChart({ data }: { data: EnrichedPoint[] }) {
  const chartColors = useChartColors();
  const chartAccentRgb = useChartAccentRgb();
  const height = 340;
  const margin = { top: 12, right: 8, left: 4, bottom: 4 };
  const stats = computeStats(data);

  const priceMin = Math.min(...data.map((d) => d.price));
  const priceMax = Math.max(...data.map((d) => d.price));
  const pricePad = Math.max(2, (priceMax - priceMin) * 0.12);

  return (
    <div className="space-y-4">
      <StatsStrip stats={stats} />

      <div
        className="hs-chart-shell w-full min-w-0"
        style={{ height, minHeight: height }}
        role="img"
        aria-label="Fair value by game night with production bars"
      >
        <ResponsiveContainer width="100%" height={height - 8} debounce={50}>
          <ComposedChart data={data} margin={margin}>
            <defs>
              <linearGradient id={FILL_GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={`rgb(${chartAccentRgb})`}
                  stopOpacity={0.22}
                />
                <stop
                  offset="100%"
                  stopColor={`rgb(${chartAccentRgb})`}
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              stroke={chartColors.grid}
              strokeDasharray={chartLayout.gridDash}
              vertical={false}
              opacity={chartLayout.gridOpacity}
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
              yAxisId="price"
              domain={[priceMin - pricePad, priceMax + pricePad]}
              tick={chartTypography.tickMono}
              tickLine={false}
              axisLine={false}
              width={52}
              tickFormatter={(v) =>
                typeof v === "number"
                  ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                  : String(v)
              }
            />
            <YAxis
              yAxisId="gmsc"
              orientation="right"
              domain={[0, "auto"]}
              tick={chartTypography.tickMono}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v) => (typeof v === "number" ? v.toFixed(0) : String(v))}
            />
            <Tooltip
              cursor={{ fill: chartColors.cursor, opacity: 0.08 }}
              content={(props) => <PerformanceTooltip {...props} />}
            />
            <Legend
              verticalAlign="top"
              align="right"
              height={24}
              wrapperStyle={chartLegend.wrapperStyle}
              iconSize={chartLegend.iconSize}
              formatter={(value) => (
                <span className="text-[11px] font-medium text-muted-foreground">
                  {String(value)}
                </span>
              )}
            />
            <Bar
              yAxisId="gmsc"
              dataKey="gmsc"
              name="GmSc"
              fill={`rgb(${chartAccentRgb})`}
              fillOpacity={0.14}
              radius={[3, 3, 0, 0]}
              maxBarSize={28}
              isAnimationActive={false}
            />
            <Area
              yAxisId="price"
              type="linear"
              dataKey="price"
              stroke="none"
              fill={`url(#${FILL_GRADIENT_ID})`}
              isAnimationActive={false}
              legendType="none"
            />
            <Line
              yAxisId="price"
              type="linear"
              dataKey="price"
              name="Fair value"
              stroke={chartColors.accent}
              strokeWidth={2.25}
              dot={(props) => {
                const { cx, cy, index } = props;
                if (cx == null || cy == null || index == null) return null;
                const row = data[index];
                if (!row) return null;
                const fill =
                  row.moveUp == null
                    ? chartColors.accent
                    : row.moveUp
                      ? "var(--positive)"
                      : "var(--negative)";
                return (
                  <circle
                    key={`dot-${index}`}
                    cx={cx}
                    cy={cy}
                    r={4}
                    fill={fill}
                    stroke={chartColors.surface}
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{
                r: 5.5,
                stroke: chartColors.surface,
                strokeWidth: 2,
              }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function PerformanceGameChart({
  points,
  range = "1m",
}: {
  points: MarketChartPoint[];
  range?: ChartRange;
}) {
  const data = useMemo(() => enrichPoints(points), [points]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-muted">
        No game nights in this window. Try 1 month for more games.
      </p>
    );
  }

  if (range === "1w") {
    return <PerformanceWeekView data={data} />;
  }

  return <PerformanceFullChart data={data} />;
}
