"use client";

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
      className="relative shrink-0 overflow-hidden rounded-2xl border-2 border-accent bg-surface-muted shadow-sm"
      style={{ width: size, height: size }}
    >
      {showImage && src ? (
        // Native img — ESPN CDN is unreliable through the Next image optimizer on Vercel.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover object-top"
          loading="eager"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
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
