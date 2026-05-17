import { NextResponse } from "next/server";
import { getLatestForPlayer } from "@/lib/marketData";
import { getPortfolioIdForUser } from "@/lib/portfolioStore";
import { createSupabaseServiceRoleClient } from "@/lib/supabase";
import { createSupabaseSessionServer } from "@/lib/supabase-session-server";

export const dynamic = "force-dynamic";

type Body = {
  player_id: number;
  side: "buy" | "sell";
  shares: number;
};

type PaperTradeResult = {
  ok: boolean;
  trade_id: string;
  side: "buy" | "sell";
  player_id: number;
  shares: number;
  filled_at_price: number;
  gross_amount: number;
  realized_pnl: number | null;
  avg_cost_before: number | null;
  avg_cost_after: number | null;
  cash_after: number;
  position_after: number;
};

function asNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseRpcHint(hint: string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!hint) return out;
  for (const part of hint.split(/\s+/)) {
    const m = /^(\w+)=(.+)$/.exec(part.trim());
    if (!m) continue;
    const n = asNumber(m[2]);
    if (n !== null) out[m[1]] = n;
  }
  return out;
}

function tradeErrorResponse(message: string, hint: string | null | undefined) {
  const parsed = parseRpcHint(hint);
  if (message.includes("Insufficient cash")) {
    return NextResponse.json(
      {
        error: "Insufficient cash",
        ...(parsed.cash !== undefined ? { cash: parsed.cash } : {}),
        ...(parsed.required !== undefined ? { required: parsed.required } : {}),
      },
      { status: 400 },
    );
  }
  if (message.includes("Insufficient shares")) {
    return NextResponse.json(
      {
        error: "Insufficient shares",
        ...(parsed.held !== undefined ? { held: parsed.held } : {}),
      },
      { status: 400 },
    );
  }
  if (message.includes("Portfolio not found")) {
    return NextResponse.json({ error: "Portfolio not found" }, { status: 404 });
  }
  return NextResponse.json({ error: message || "Trade failed" }, { status: 500 });
}

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

  const supabaseAuth = await createSupabaseSessionServer();
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  const portfolioId = await getPortfolioIdForUser(user?.id ?? null);

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.rpc("execute_paper_trade", {
    p_portfolio_id: portfolioId,
    p_player_id: playerId,
    p_side: side,
    p_shares: shares,
    p_price: price,
  });

  if (error) {
    return tradeErrorResponse(error.message, error.hint);
  }

  const raw = data as Record<string, unknown> | null;
  if (!raw || raw.ok !== true) {
    return NextResponse.json({ error: "Trade failed" }, { status: 500 });
  }

  const result: PaperTradeResult = {
    ok: true,
    trade_id: String(raw.trade_id),
    side: raw.side === "sell" ? "sell" : "buy",
    player_id: asNumber(raw.player_id) ?? playerId,
    shares: asNumber(raw.shares) ?? shares,
    filled_at_price: asNumber(raw.filled_at_price) ?? price,
    gross_amount: asNumber(raw.gross_amount) ?? 0,
    realized_pnl:
      raw.realized_pnl === null || raw.realized_pnl === undefined
        ? null
        : asNumber(raw.realized_pnl),
    avg_cost_before:
      raw.avg_cost_before === null || raw.avg_cost_before === undefined
        ? null
        : asNumber(raw.avg_cost_before),
    avg_cost_after:
      raw.avg_cost_after === null || raw.avg_cost_after === undefined
        ? null
        : asNumber(raw.avg_cost_after),
    cash_after: asNumber(raw.cash_after) ?? 0,
    position_after: asNumber(raw.position_after) ?? 0,
  };

  return NextResponse.json(result);
}
