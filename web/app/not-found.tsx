import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center md:py-24">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
        404
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-foreground">Page not found</h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted">
        That player isn&apos;t in the pricing file, the ID is invalid, or this URL
        doesn&apos;t exist.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link
          href="/"
          className="rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground hover:bg-accent-hover"
        >
          Home
        </Link>
        <Link
          href="/market"
          className="rounded-xl border border-border-strong px-5 py-2.5 text-sm font-medium text-foreground hover:border-border-strong"
        >
          Market
        </Link>
      </div>
    </div>
  );
}
