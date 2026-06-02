"use client";

import Image from "next/image";
import { useState } from "react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

export function PlayerHeadshot({
  src,
  name,
  size = 88,
}: {
  src: string | null;
  name: string;
  size?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-2xl border border-border/80 bg-surface-muted shadow-sm"
      style={{ width: size, height: size }}
    >
      {showImage && src ? (
        <Image
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover object-top"
          sizes={`${size}px`}
          onError={() => setFailed(true)}
          priority
        />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-surface-muted text-lg font-semibold tracking-wide text-muted-foreground"
          aria-hidden
        >
          {initials(name)}
        </div>
      )}
    </div>
  );
}
