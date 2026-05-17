import { AddMarketPosition } from "@/components/AddMarketPosition";
import { PageHeader } from "@/components/PageHeader";
import { PortfolioHoldingsTable } from "@/components/PortfolioHoldingsTable";
import { RecentActivity } from "@/components/RecentActivity";
import { formatUsd } from "@/lib/format";
import { formatSignedUsd, pnlTextClass } from "@/lib/portfolioPnl";
import { getPortfolioSnapshot } from "@/lib/portfolioView";
import { createSupabaseSessionServer } from "@/lib/supabase-session-server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Portfolio",
};

function pct(n: number) {
  return `${n.toFixed(2)}%`;
}

export default async function PortfolioPage() {
  let snap;
  try {
    const supabase = await createSupabaseSessionServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    snap = await getPortfolioSnapshot(user?.id ?? null);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return <p className="text-rose-400">{msg}</p>;
  }

  const returnPositive = snap.totalReturn >= 0;

  return (
    <div>
      <PageHeader
        eyebrow="Account"
        title="Portfolio"
        description="Starter account funded with $100,000. Holdings use latest model prices; cost basis and P&amp;L come from your trade history."
      />

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm shadow-black/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Total portfolio value
          </div>
          <div className="mt-1 font-mono text-3xl text-zinc-50">{formatUsd(snap.total)}</div>
          <p className="mt-2 text-xs text-zinc-600">
            Cash plus market value of all player shares.
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm shadow-black/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            All-time return (vs start)
          </div>
          <div
            className={`mt-1 font-mono text-3xl ${
              returnPositive ? "text-emerald-400" : "text-rose-400"
            }`}
          >
            {returnPositive ? "+" : ""}
            {formatUsd(snap.totalReturn)}
            <span className="ml-2 text-xl">
              ({returnPositive ? "+" : ""}
              {snap.totalReturnPct.toFixed(2)}%)
            </span>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Compared to initial {formatUsd(snap.startingCash)} cash — account-level change since
            funding.
          </p>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm shadow-black/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Realized P&amp;L
          </div>
          <div className={`mt-1 font-mono text-2xl ${pnlTextClass(snap.realizedPnl)}`}>
            {formatSignedUsd(snap.realizedPnl)}
          </div>
          <p className="mt-2 text-xs text-zinc-600">Closed gains/losses from sells.</p>
        </div>
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm shadow-black/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Unrealized P&amp;L
          </div>
          <div className={`mt-1 font-mono text-2xl ${pnlTextClass(snap.unrealizedPnl)}`}>
            {formatSignedUsd(snap.unrealizedPnl)}
          </div>
          <p className="mt-2 text-xs text-zinc-600">Open positions vs average cost.</p>
        </div>
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm shadow-black/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Total P&amp;L
          </div>
          <div className={`mt-1 font-mono text-2xl ${pnlTextClass(snap.totalPnl)}`}>
            {formatSignedUsd(snap.totalPnl)}
          </div>
          <p className="mt-2 text-xs text-zinc-600">Realized plus unrealized.</p>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm shadow-black/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Cash (uninvested)
          </div>
          <div className="mt-1 font-mono text-2xl text-emerald-400">{formatUsd(snap.cash)}</div>
          <p className="mt-2 text-sm text-zinc-400">
            {pct(snap.cashPct)} of portfolio · buying power for new trades
          </p>
        </div>
        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-900/40 p-5 shadow-sm shadow-black/20">
          <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Stocks (market value)
          </div>
          <div className="mt-1 font-mono text-2xl text-zinc-100">
            {formatUsd(snap.positionsValue)}
          </div>
          <p className="mt-2 text-sm text-zinc-400">
            {pct(snap.equitiesPct)} of portfolio · shares × latest price
          </p>
        </div>
      </div>

      <div className="mb-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
          Allocation
        </p>
        <div className="flex h-3 w-full max-w-xl overflow-hidden rounded-full bg-zinc-800">
          <div
            className="min-h-full min-w-0 bg-emerald-500"
            style={{ flexGrow: Math.max(0, snap.equitiesPct), flexBasis: 0 }}
            title="Stocks"
          />
          <div
            className="min-h-full min-w-0 bg-zinc-600"
            style={{ flexGrow: Math.max(0, snap.cashPct), flexBasis: 0 }}
            title="Cash"
          />
        </div>
        <p className="mt-2 text-xs text-zinc-600">
          <span className="text-emerald-500">■</span> Stocks{" "}
          <span className="text-zinc-500">■</span> Cash
        </p>
      </div>

      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Holdings &amp; trade
      </h2>
      <PortfolioHoldingsTable positions={snap.positions} />

      <h2 className="mb-4 mt-10 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Recent activity
      </h2>
      <RecentActivity trades={snap.recentTrades} />

      <div className="mt-10">
        <AddMarketPosition />
      </div>
    </div>
  );
}
