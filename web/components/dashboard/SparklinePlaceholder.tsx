import { buildSmoothSvgPath } from "@/lib/chartTheme";

const BARS = [38, 52, 42, 58, 48, 64, 50, 68, 54, 60];

/** Reserved slot for future per-player sparklines — smooth mini line strip. */
export function SparklinePlaceholder({ positive }: { positive?: boolean }) {
  const w = 68;
  const h = 32;
  const pad = 3;
  const min = Math.min(...BARS);
  const max = Math.max(...BARS);
  const range = max - min || 1;

  const coords: [number, number][] = BARS.map((v, i) => {
    const x = pad + (i / (BARS.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });

  const stroke =
    positive === true
      ? "var(--positive)"
      : positive === false
        ? "var(--negative)"
        : "var(--accent)";
  const strokeOpacity = positive != null ? 0.75 : 0.55;

  return (
    <div className="hidden h-8 w-[4.25rem] shrink-0 sm:block" aria-hidden>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-full w-full" preserveAspectRatio="none">
        <path
          d={buildSmoothSvgPath(coords)}
          fill="none"
          stroke={stroke}
          strokeOpacity={strokeOpacity}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
