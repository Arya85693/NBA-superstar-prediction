"use client";

import { useEffect, useState } from "react";

import {
  CHART_ACCENT_RGB,
  readChartColorsFromDocument,
  type ChartColorTokens,
  chartColors as chartColorsLight,
} from "@/lib/chartTheme";

export function useChartColors(): ChartColorTokens {
  const [colors, setColors] = useState(chartColorsLight);

  useEffect(() => {
    const sync = () => setColors(readChartColorsFromDocument());

    sync();
    const root = document.documentElement;
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

export function useChartAccentRgb(): string {
  const [rgb, setRgb] = useState(CHART_ACCENT_RGB);

  useEffect(() => {
    const sync = () => {
      const value = getComputedStyle(document.documentElement)
        .getPropertyValue("--chart-accent-rgb")
        .trim();
      setRgb(value || CHART_ACCENT_RGB);
    };

    sync();
    const root = document.documentElement;
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return rgb;
}
