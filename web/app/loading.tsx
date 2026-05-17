export default function HomeLoading() {
  return (
    <div
      className="animate-pulse space-y-14 pb-16 md:space-y-16 md:pb-24"
      aria-busy="true"
      aria-label="Loading dashboard"
    >
      <div className="space-y-4 pt-4">
        <div className="mx-auto h-4 w-40 rounded bg-surface-inset lg:mx-0" />
        <div className="h-12 max-w-xl rounded-lg bg-surface-inset lg:h-14" />
        <div className="h-5 max-w-md rounded bg-surface-inset" />
        <div className="flex gap-3 pt-2">
          <div className="h-11 w-36 rounded-xl bg-surface-inset" />
          <div className="h-11 w-36 rounded-xl bg-surface-inset" />
        </div>
      </div>
      <div className="h-14 rounded-xl bg-surface-inset" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-36 rounded-2xl bg-surface-inset" />
        <div className="h-36 rounded-2xl bg-surface-inset" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`kpi-${i}`} className="h-28 rounded-2xl bg-surface-inset" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-80 rounded-2xl bg-surface-inset" />
        <div className="h-80 rounded-2xl bg-surface-inset" />
      </div>
    </div>
  );
}
