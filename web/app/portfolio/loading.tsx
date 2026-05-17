export default function PortfolioLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading portfolio">
      <div className="h-6 w-48 rounded bg-surface-inset" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-surface-inset" />
        <div className="h-24 rounded-xl bg-surface-inset" />
        <div className="h-24 rounded-xl bg-surface-inset" />
      </div>
      <div className="h-48 rounded-xl bg-surface-inset" />
    </div>
  );
}
