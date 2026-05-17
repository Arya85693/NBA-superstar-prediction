export function SnapshotBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border-strong bg-surface-muted px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground ${className}`}
    >
      Near real-time snapshot
    </span>
  );
}
