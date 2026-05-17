import { AddMarketPosition } from "@/components/AddMarketPosition";

import { PageHeader } from "@/components/PageHeader";

import { PortfolioHoldingsTable } from "@/components/PortfolioHoldingsTable";

import { WatchlistPanel } from "@/components/portfolio/WatchlistPanel";

import { RecentActivity } from "@/components/RecentActivity";

import { DashboardCard } from "@/components/dashboard/DashboardCard";

import { SectionHeading } from "@/components/ui/SectionHeading";

import { formatUsd } from "@/lib/format";

import { formatSignedUsd, pnlTextClass } from "@/lib/portfolioPnl";

import { getMarketMeta } from "@/lib/marketData";

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

  let marketMeta;

  try {

    const supabase = await createSupabaseSessionServer();

    const {

      data: { user },

    } = await supabase.auth.getUser();

    [snap, marketMeta] = await Promise.all([
      getPortfolioSnapshot(user?.id ?? null),
      getMarketMeta(),
    ]);

  } catch (e) {

    const msg = e instanceof Error ? e.message : "Error";

    return <p className="text-negative">{msg}</p>;

  }



  const returnPositive = snap.totalReturn >= 0;



  return (

    <div>

      <PageHeader

        eyebrow="Paper account"

        title="Portfolio"

        description="Starter account funded with $100,000. Holdings mark to the latest model quotes from each refresh cycle; cost basis and P&amp;L come from your trade history. Portfolio values update automatically when new game data is ingested (~30 min cadence)."

        marketMeta={marketMeta}

        showSimulationNote

      />



      <div className="mb-8 grid gap-5 lg:grid-cols-2">

        <DashboardCard

          variant="featured"

          label="Total portfolio value"

          value={formatUsd(snap.total)}

          hint="Cash plus market value of all player shares."

        />

        <DashboardCard

          variant="featured"

          label="All-time return (vs start)"

          value={

            <>

              {returnPositive ? "+" : ""}

              {formatUsd(snap.totalReturn)}

              <span className="ml-2 text-xl font-medium">

                ({returnPositive ? "+" : ""}

                {snap.totalReturnPct.toFixed(2)}%)

              </span>

            </>

          }

          valueClassName={returnPositive ? "text-positive" : "text-negative"}

          hint={`Compared to initial ${formatUsd(snap.startingCash)} cash - account-level change since funding.`}

        />

      </div>



      <div className="mb-8 grid gap-4 sm:grid-cols-3">

        <DashboardCard

          label="Realized P&amp;L"

          value={formatSignedUsd(snap.realizedPnl)}

          valueClassName={pnlTextClass(snap.realizedPnl)}

          hint="Closed gains/losses from sells."

        />

        <DashboardCard

          label="Unrealized P&amp;L"

          value={formatSignedUsd(snap.unrealizedPnl)}

          valueClassName={pnlTextClass(snap.unrealizedPnl)}

          hint="Open positions vs average cost."

        />

        <DashboardCard

          label="Total P&amp;L"

          value={formatSignedUsd(snap.totalPnl)}

          valueClassName={pnlTextClass(snap.totalPnl)}

          hint="Realized plus unrealized."

        />

      </div>



      <div className="mb-10 grid gap-4 sm:grid-cols-2">

        <DashboardCard

          label="Cash (uninvested)"

          value={formatUsd(snap.cash)}

          hint={`${pct(snap.cashPct)} of portfolio · buying power for new trades`}

        />

        <DashboardCard

          label="Positions (market value)"

          value={formatUsd(snap.positionsValue)}

          hint={`${pct(snap.equitiesPct)} of portfolio · shares × latest price`}

        />

      </div>



      <div className="mb-10 hs-inset px-5 py-5">

        <p className="hs-label">Allocation</p>

        <div className="mt-4 flex h-2.5 w-full max-w-xl overflow-hidden rounded-full bg-surface-inset">

          <div

            className="min-h-full min-w-0 bg-accent/80"

            style={{ flexGrow: Math.max(0, snap.equitiesPct), flexBasis: 0 }}

            title="Positions"

          />

          <div

            className="min-h-full min-w-0 bg-border-strong"

            style={{ flexGrow: Math.max(0, snap.cashPct), flexBasis: 0 }}

            title="Cash"

          />

        </div>

        <p className="mt-3 text-xs text-muted">

          <span className="text-accent">■</span> Positions{" "}

          <span className="text-border-strong">■</span> Cash

        </p>

      </div>



      <SectionHeading

        className="mb-5"

        title="Watchlist"

        description="Players you are tracking without a position. Saved on this device - open any row for insights or paper trade."

      />

      <WatchlistPanel />



      <SectionHeading

        className="mb-5 mt-12"

        title="Holdings & trade"

        description="Open positions at latest model quotes. Trade inline or from any player page."

      />

      <PortfolioHoldingsTable positions={snap.positions} />



      <SectionHeading

        className="mb-5 mt-12"

        title="Recent activity"

        description="Your latest paper trades across the board."

      />

      <RecentActivity trades={snap.recentTrades} />



      <div className="mt-12">

        <AddMarketPosition />

      </div>

    </div>

  );

}

