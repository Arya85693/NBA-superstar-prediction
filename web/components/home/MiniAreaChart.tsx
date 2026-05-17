import {
  CHART_ACCENT,
  CHART_ACCENT_RGB,
  buildSmoothAreaPath,
  buildSmoothSvgPath,
} from "@/lib/chartTheme";

/** Lightweight SVG area chart for homepage previews — smooth monotone curve. */
export function MiniAreaChart({
  values,
  positive,
  className = "",
}: {
  values: number[];
  positive?: boolean;
  className?: string;
}) {
  const pts = values.length >= 2 ? values : [50, 52, 48, 55, 53, 58, 56, 62, 60, 65];
  const w = 280;
  const h = 72;
  const padX = 6;
  const padY = 8;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;

  const coords: [number, number][] = pts.map((v, i) => {
    const x = padX + (i / (pts.length - 1)) * (w - padX * 2);
    const y = h - padY - ((v - min) / range) * (h - padY * 2);
    return [x, y];
  });

  const linePath = buildSmoothSvgPath(coords);
  const areaPath = buildSmoothAreaPath(coords, h - padY + 1);

  const stroke =
    positive === true
      ? "var(--positive)"
      : positive === false
        ? "var(--negative)"
        : CHART_ACCENT;
  const fillTop =
    positive === true
      ? "rgb(13 122 95 / 0.14)"
      : positive === false
        ? "rgb(196 61 82 / 0.1)"
        : `rgb(${CHART_ACCENT_RGB} / 0.12)`;
  const fillBottom =
    positive === true
      ? "rgb(13 122 95 / 0)"
      : positive === false
        ? "rgb(196 61 82 / 0)"
        : `rgb(${CHART_ACCENT_RGB} / 0)`;

  const gradientId = `mini-area-${positive === true ? "up" : positive === false ? "down" : "neutral"}`;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={`h-full w-full ${className}`}
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={fillTop} />
          <stop offset="100%" stopColor={fillBottom} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
