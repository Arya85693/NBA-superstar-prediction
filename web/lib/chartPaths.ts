/** Monotone-style cubic path for lightweight SVG sparklines / mini charts. */
export function buildSmoothSvgPath(points: readonly [number, number][]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0]![0]},${points[0]![1]}`;

  let d = `M ${points[0]![0]},${points[0]![1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(i - 1, 0)]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[Math.min(i + 2, points.length - 1)]!;
    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

export function buildSmoothAreaPath(
  points: readonly [number, number][],
  baselineY: number,
): string {
  if (points.length === 0) return "";
  const line = buildSmoothSvgPath(points);
  const last = points[points.length - 1]!;
  const first = points[0]!;
  return `${line} L ${last[0]},${baselineY} L ${first[0]},${baselineY} Z`;
}
