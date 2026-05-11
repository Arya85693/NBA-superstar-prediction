import { NextResponse } from "next/server";
import { getLatestForPlayer } from "@/lib/marketData";
import {
  getPortfolioIdForUser,
  readPortfolio,
  roundMoney,
  writePortfolio,
} from "@/lib/portfolioStore";
import { createSupabaseSessionServer } from "@/lib/supabase-session-server";

export const dynamic = "force-dynamic";

type Body = {
  player_id: number;
  side: "buy" | "sell";
  shares: number;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const playerId = Number(body.player_id);
  const shares = Math.floor(Number(body.shares));
  const side = body.side;

  if (!Number.isFinite(playerId) || playerId <= 0) {
    return NextResponse.json({ error: "Invalid player_id" }, { status: 400 });
  }
  if (side !== "buy" && side !== "sell") {
    return NextResponse.json({ error: "side must be buy or sell" }, { status: 400 });
  }
  if (!Number.isFinite(shares) || shares < 1) {
    return NextResponse.json(
      { error: "shares must be a positive whole number" },
      { status: 400 },
    );
  }

  const quote = await getLatestForPlayer(playerId);
  if (!quote) {
    return NextResponse.json({ error: "Unknown player" }, { status: 404 });
  }

  const price = quote.price_after_game;
  const gross = roundMoney(price * shares);

  const supabaseAuth = await createSupabaseSessionServer();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const portfolioId = await getPortfolioIdForUser(user?.id ?? null);

  const pf = await readPortfolio(portfolioId);
  const key = String(playerId);
  const held = pf.positions[key] ?? 0;

  if (side === "buy") {
    if (pf.cash + 1e-9 < gross) {
      return NextResponse.json(
        { error: "Insufficient cash", cash: pf.cash, required: gross },
        { status: 400 },
      );
    }
    pf.cash = roundMoney(pf.cash - gross);
    pf.positions[key] = held + shares;
  } else {
    if (held + 1e-9 < shares) {
      return NextResponse.json(
        { error: "Insufficient shares", held },
        { status: 400 },
      );
    }
    pf.cash = roundMoney(pf.cash + gross);
    const next = held - shares;
    if (next <= 0) delete pf.positions[key];
    else pf.positions[key] = next;
  }

  await writePortfolio(portfolioId, pf);

  return NextResponse.json({
    ok: true,
    filled_at_price: price,
    shares,
    side,
    cash_after: pf.cash,
    position_after: pf.positions[key] ?? 0,
  });
}
