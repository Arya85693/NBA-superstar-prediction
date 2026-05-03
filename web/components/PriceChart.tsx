"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  type TooltipContentProps,
  XAxis,
  YAxis,
} from "recharts";
import { formatUsd } from "@/lib/format";
import type { PriceRow } from "@/lib/types";

type Pt = { date: string; price: number; gs: number };

function PriceTooltip({ active, payload }: TooltipContentProps) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Pt | undefined;
  if (!row) return null;
  return (
    <div
      className="rounded-lg border border-zinc-600 bg-zinc-900 px-3 py-2.5 shadow-xl"
      style={{ boxShadow: "0 10px 40px rgba(0,0,0,0.45)" }}
    >
      <p className="mb-2 text-xs font-semibold text-zinc-300">
        {formatTooltipDate(row.date)}
      </p>
      <p className="font-mono text-sm text-emerald-400">
        {formatUsd(row.price)}{" "}
        <span className="text-xs font-normal text-zinc-500">model price</span>
      </p>
      <p className="mt-1 font-mono text-sm text-zinc-300">
        GmSc {row.gs.toFixed(1)}{" "}
        <span className="text-xs font-normal text-zinc-500">that game</span>
      </p>
    </div>
  );
}

const TICK = { fill: "#a1a1aa", fontSize: 11 };
const GRID = "#27272a";
const AXIS_LINE = "#3f3f46";

function formatAxisDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
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

export function PriceChart({ history }: { history: PriceRow[] }) {
  const data: Pt[] = history.map((h) => ({
    date: h.game_date,
    price: h.price_after_game,
    gs: h.game_score,
  }));

  if (data.length === 0) {
    return <p className="text-zinc-500">No history.</p>;
  }

  const h = 320;
  const showDots = data.length <= 24;

  return (
    <div
      className="w-full min-w-0"
      style={{ height: h, minHeight: h }}
      role="img"
      aria-label="Player model price over time, by game date"
    >
      <ResponsiveContainer width="100%" height={h} debounce={50}>
        <LineChart
          data={data}
          margin={{ top: 16, right: 10, left: 6, bottom: 12 }}
        >
          <defs>
            <linearGradient id="priceStroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#6ee7b7" />
            </linearGradient>
          </defs>
          <CartesianGrid
            stroke={GRID}
            strokeDasharray="4 4"
            vertical={false}
            opacity={0.9}
          />
          <XAxis
            dataKey="date"
            tick={TICK}
            tickLine={{ stroke: AXIS_LINE }}
            axisLine={{ stroke: AXIS_LINE }}
            tickFormatter={formatAxisDate}
            interval="preserveStartEnd"
            minTickGap={28}
          />
          <YAxis
            domain={["auto", "auto"]}
            tick={TICK}
            tickLine={{ stroke: AXIS_LINE }}
            axisLine={{ stroke: AXIS_LINE }}
            width={54}
            tickFormatter={(v) =>
              typeof v === "number"
                ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                : String(v)
            }
            label={{
              value: "Price",
              angle: -90,
              position: "insideLeft",
              fill: "#a1a1aa",
              fontSize: 11,
              offset: 4,
            }}
          />
          <Tooltip
            cursor={{ stroke: "#52525b", strokeWidth: 1, strokeDasharray: "4 4" }}
            content={PriceTooltip}
          />
          <Legend
            wrapperStyle={{ paddingTop: 8, fontSize: 12 }}
            iconType="line"
            formatter={(value) => (
              <span className="text-zinc-400">{String(value)}</span>
            )}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="url(#priceStroke)"
            strokeWidth={2.25}
            dot={
              showDots
                ? { r: 3.5, fill: "#6ee7b7", stroke: "#064e3b", strokeWidth: 1 }
                : false
            }
            activeDot={{ r: 6, fill: "#a7f3d0", stroke: "#047857", strokeWidth: 2 }}
            isAnimationActive={false}
            name="Model price"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
