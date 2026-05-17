import type { ReactNode } from "react";

export function DashboardCard({
  label,
  value,
  hint,
  labelTitle,
  valueClassName,
  children,
  className,
  compactValue,
  variant = "default",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  /** Native tooltip on the metric label (e.g. Board Total definition). */
  labelTitle?: string;
  valueClassName?: string;
  children?: ReactNode;
  className?: string;
  compactValue?: boolean;
  /** Featured = headline board metrics (board total, median). */
  variant?: "default" | "featured";
}) {
  const shell =
    variant === "featured"
      ? "dash-kpi-featured px-6 py-6 md:px-8 md:py-7"
      : "dash-kpi px-5 py-5 md:px-6 md:py-6";

  const valueSize = compactValue
    ? ""
    : variant === "featured"
      ? "text-[1.75rem] leading-none md:text-[2.125rem]"
      : "text-2xl leading-none md:text-[1.75rem]";

  const valueLayout = compactValue
    ? ""
    : "font-mono font-medium tabular-nums tracking-tight";

  return (
    <div className={`flex flex-col ${shell} ${className ?? ""}`}>
      <p className="dash-label" title={labelTitle}>
        {label}
      </p>
      <div
        className={`mt-3 min-w-0 text-foreground ${valueLayout} ${valueSize} ${valueClassName ?? ""}`}
      >
        {value}
      </div>
      {hint ? (
        <p className="mt-3 line-clamp-2 text-[13px] leading-relaxed text-muted">{hint}</p>
      ) : null}
      {children}
    </div>
  );
}
