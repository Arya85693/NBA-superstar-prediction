import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "hs-btn hs-btn-primary",
  secondary: "hs-btn hs-btn-secondary",
  ghost: "hs-btn hs-btn-ghost",
};

const sizeClass: Record<Size, string> = {
  sm: "hs-btn-sm",
  md: "",
  lg: "hs-btn-lg",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
}) {
  return (
    <button
      type="button"
      className={`${variantClass[variant]} ${sizeClass[size]} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
}) {
  return (
    <Link
      href={href}
      className={`${variantClass[variant]} ${sizeClass[size]} ${className}`.trim()}
      {...props}
    >
      {children}
    </Link>
  );
}
