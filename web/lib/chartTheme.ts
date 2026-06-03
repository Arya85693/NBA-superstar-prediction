/** Shared tokens for Recharts + SVG charts - editorial finance, not crypto UI. */

export const CHART_ACCENT = "#b76e79";
export const CHART_ACCENT_RGB = "183 110 121";

export type ChartColorTokens = {
  accent: string;
  grid: string;
  axis: string;
  tick: string;
  tickMuted: string;
  cursor: string;
  surface: string;
};

const chartColorsLight: ChartColorTokens = {
  accent: CHART_ACCENT,
  grid: "rgba(44, 40, 37, 0.07)",
  axis: "rgba(111, 104, 96, 0.28)",
  tick: "#6f6860",
  tickMuted: "#8a827a",
  cursor: "rgba(111, 104, 96, 0.35)",
  surface: "#fffcfa",
};

function readCssVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

export function readChartColorsFromDocument(): ChartColorTokens {
  return {
    accent: readCssVar("--chart-accent", chartColorsLight.accent),
    grid: readCssVar("--chart-grid-stroke", chartColorsLight.grid),
    axis: readCssVar("--chart-axis", chartColorsLight.axis),
    tick: readCssVar("--chart-tick", chartColorsLight.tick),
    tickMuted: readCssVar("--chart-tick-muted", chartColorsLight.tickMuted),
    cursor: readCssVar("--chart-cursor", chartColorsLight.cursor),
    surface: readCssVar("--chart-surface", chartColorsLight.surface),
  };
}

/** @deprecated Use useChartColors() in client charts for theme-aware colors. */
export const chartColors = chartColorsLight;

export const chartTypography = {
  tick: {
    fill: chartColorsLight.tick,
    fontSize: 10.5,
    fontWeight: 500,
  },
  tickMono: {
    fill: chartColorsLight.tick,
    fontSize: 10.5,
    fontWeight: 500,
    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
  },
} as const;

export const chartLayout = {
  height: 300,
  margin: { top: 6, right: 10, left: 2, bottom: 2 },
  yAxisWidth: 50,
  strokeWidth: 1.5,
  gridDash: "2 8",
  gridOpacity: 0.9,
  areaFillTop: 0.16,
  areaFillBottom: 0,
} as const;

export const chartLegend = {
  wrapperStyle: {
    paddingTop: 0,
    paddingBottom: 0,
    fontSize: 11,
    lineHeight: "1.2",
  },
  iconSize: 14,
} as const;

export { buildSmoothAreaPath, buildSmoothSvgPath } from "@/lib/chartPaths";
