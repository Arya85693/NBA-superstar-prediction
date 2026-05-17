export default function MarketLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading market">
      <div className="h-6 w-40 rounded bg-surface-inset" />
      <div className="h-24 max-w-xl rounded-xl bg-surface-inset/70" />
      <div className="h-64 rounded-xl bg-surface-inset" />
    </div>
  );
}
