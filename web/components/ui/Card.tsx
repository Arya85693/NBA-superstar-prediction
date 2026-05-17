import type { ElementType, ReactNode } from "react";

type CardVariant = "surface" | "panel" | "kpi" | "kpi-featured" | "inset";

const variantClass: Record<CardVariant, string> = {
  surface: "hs-card",
  panel: "hs-panel",
  kpi: "dash-kpi",
  "kpi-featured": "dash-kpi-featured",
  inset: "hs-inset",
};

export function Card({
  children,
  variant = "surface",
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  variant?: CardVariant;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  const Component = Tag as ElementType;
  return (
    <Component className={`${variantClass[variant]} ${className}`.trim()}>
      {children}
    </Component>
  );
}
