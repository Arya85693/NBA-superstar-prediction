export default function PlayerLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading player">
      <div className="h-4 w-64 rounded bg-surface-inset" />
      <div className="h-10 w-72 max-w-full rounded bg-surface-inset/90" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="h-28 rounded-xl bg-surface-inset" />
        <div className="h-28 rounded-xl bg-surface-inset" />
        <div className="h-28 rounded-xl bg-surface-inset" />
        <div className="h-28 rounded-xl bg-surface-inset" />
      </div>
      <div className="h-64 rounded-xl bg-surface-inset" />
    </div>
  );
}
