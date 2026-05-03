export default function PortfolioLoading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading portfolio">
      <div className="h-6 w-48 rounded bg-zinc-800" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 rounded-xl bg-zinc-800/60" />
        <div className="h-24 rounded-xl bg-zinc-800/60" />
        <div className="h-24 rounded-xl bg-zinc-800/60" />
      </div>
      <div className="h-48 rounded-xl bg-zinc-800/40" />
    </div>
  );
}
