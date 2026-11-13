/**
 * market-tick: runs every 5 minutes (pg_cron -> pg_net, see supabase/live_market.sql).
 *
 * 1. Live games: reads ESPN's scoreboard; for games in progress (and each game's
 *    final line once), parses the box score, maps ESPN athletes to player ids
 *    (public.espn_player_map) and writes a provisional Fair Value per player to
 *    public.player_live_games, using the exact one-game step from price_engine.py
 *    (ported in _shared/liveFairValue.ts, state from public.player_fv_state).
 * 2. Market Price: steps every active player's price toward its target with the
 *    same time-scaled reversion and caps as the Python market step, anchored to
 *    live Fair Value during games, and writes through public.apply_market_tick()
 *    (atomic, lease-aware, bumps market_revision so open pages refresh).
 *
 * A live-data failure never blocks step 2. Deploy with --no-verify-jwt; the
 * caller must send x-tick-secret matching the TICK_SECRET function secret.
 */
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import {
  ESPN_BASE,
  type EspnGame,
  isPricedGame,
  parseScoreboard,
  parseSummaryLines,
  scanDates,
  seasonLabel,
} from "../_shared/espn.ts";
import {
  type FvState,
  gameProgress,
  hollingerGameScore,
  liveFairValue,
} from "../_shared/liveFairValue.ts";
import { type LiveInfo, type MarketStateRow, planTick, type TickRow } from "../_shared/marketTick.ts";

const PAGE = 1000;
const LIVE_RETENTION_DAYS = 3;
const ESPN_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Encoding": "gzip",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function espnJson(url: string, attempts = 3): Promise<unknown> {
  let lastErr: unknown = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, { headers: ESPN_HEADERS, signal: AbortSignal.timeout(15000) });
      if (res.ok) return await res.json();
      lastErr = new Error(`ESPN ${res.status} for ${url}`);
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500 * i));
  }
  throw lastErr;
}

// deno-lint-ignore no-explicit-any
async function selectAll<T>(build: (from: number, to: number) => any): Promise<T[]> {
  const out: T[] = [];
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await build(start, start + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) return out;
  }
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function clockLabel(g: EspnGame): string {
  if (g.state === "post") return "Final";
  const m = Math.floor(g.clockSeconds / 60);
  const s = Math.floor(g.clockSeconds % 60);
  const p = g.period > 4 ? `OT${g.period - 4}` : `Q${g.period}`;
  return `${p} ${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 1) Live games -> player_live_games
// ---------------------------------------------------------------------------
async function refreshLiveGames(sb: SupabaseClient, now: Date) {
  const dates = scanDates(now);
  const games: EspnGame[] = [];
  for (const day of dates) {
    const sbJson = await espnJson(`${ESPN_BASE}/scoreboard?dates=${day.replaceAll("-", "")}`);
    games.push(...parseScoreboard(sbJson, day).filter(isPricedGame));
  }
  const active = games.filter((g) => g.state === "in" || g.state === "post");
  if (active.length === 0) return { games: games.length, live: 0, fetched: 0, written: 0 };

  const { data: doneRows, error: doneErr } = await sb
    .from("live_game_events")
    .select("espn_event_id, game_state")
    .in("espn_event_id", active.map((g) => g.eventId));
  if (doneErr) throw new Error(doneErr.message);
  const finalized = new Set(
    (doneRows ?? []).filter((r) => r.game_state === "post").map((r) => String(r.espn_event_id)),
  );
  const toFetch = active.filter((g) => g.state === "in" || !finalized.has(g.eventId));
  if (toFetch.length === 0) {
    return { games: games.length, live: 0, fetched: 0, written: 0 };
  }

  const mapRows = await selectAll<{ espn_id: string; player_id: number }>((a, b) =>
    sb.from("espn_player_map").select("espn_id, player_id").order("espn_id").range(a, b)
  );
  const espnToPlayer = new Map(mapRows.map((r) => [String(r.espn_id), Number(r.player_id)]));

  const perGame: { game: EspnGame; lines: ReturnType<typeof parseSummaryLines> }[] = [];
  for (const game of toFetch) {
    const summary = await espnJson(`${ESPN_BASE}/summary?event=${game.eventId}`);
    perGame.push({ game, lines: parseSummaryLines(summary) });
  }

  const playerIds = [
    ...new Set(
      perGame.flatMap(({ lines }) =>
        lines.map((l) => espnToPlayer.get(l.espnId)).filter((v): v is number => v != null)
      ),
    ),
  ];
  const fvStates = new Map<number, FvState>();
  for (let i = 0; i < playerIds.length; i += 200) {
    const { data, error } = await sb
      .from("player_fv_state")
      .select("*")
      .in("player_id", playerIds.slice(i, i + 200));
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      fvStates.set(Number(r.player_id), {
        ...r,
        player_id: Number(r.player_id),
        fair_value: Number(r.fair_value),
        games_in_season: Number(r.games_in_season),
        season_eff_sum: Number(r.season_eff_sum),
        hist_mean: Number(r.hist_mean),
        hist_std: Number(r.hist_std),
        hist_n: Number(r.hist_n),
        prior_eff: r.prior_eff == null ? null : Number(r.prior_eff),
        prior_conf: Number(r.prior_conf),
        mean_minutes: Number(r.mean_minutes),
        gs_per_minute: Number(r.gs_per_minute),
      } as FvState);
    }
  }

  const rows: Record<string, unknown>[] = [];
  let unmapped = 0;
  let settled = 0;
  for (const { game, lines } of perGame) {
    const progress = gameProgress(game.state, game.period, game.clockSeconds);
    for (const l of lines) {
      if (l.didNotPlay || l.line.minutes <= 0) continue;
      const pid = espnToPlayer.get(l.espnId);
      if (pid == null) {
        unmapped++;
        continue;
      }
      const st = fvStates.get(pid);
      if (!st || st.season !== seasonLabel(game.seasonYear)) continue;
      if (st.last_game_date && st.last_game_date >= game.gameDate) {
        settled++; // final box score already in Fair Value
        continue;
      }
      const gs = hollingerGameScore(l.line);
      const lv = liveFairValue(st, gs, l.line.minutes, progress);
      rows.push({
        player_id: pid,
        game_date: game.gameDate,
        espn_event_id: game.eventId,
        game_state: game.state,
        period: game.period,
        clock: clockLabel(game),
        progress: Number(lv.progress.toFixed(4)),
        minutes: l.line.minutes,
        game_score: Number(gs.toFixed(3)),
        projected_minutes: Number(lv.projectedMinutes.toFixed(2)),
        projected_game_score: Number(lv.projectedGameScore.toFixed(3)),
        base_fair_value: Number(st.fair_value.toFixed(4)),
        live_fair_value: Number(lv.fairValue.toFixed(4)),
        stat_line: { ...l.line, team: l.teamAbbr, name: l.name },
        updated_at: now.toISOString(),
      });
    }
  }

  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await sb
      .from("player_live_games")
      .upsert(rows.slice(i, i + 500), { onConflict: "player_id,game_date" });
    if (error) throw new Error(error.message);
  }

  const { error: evErr } = await sb.from("live_game_events").upsert(
    perGame.map(({ game }) => ({
      espn_event_id: game.eventId,
      game_date: game.gameDate,
      game_state: game.state,
      updated_at: now.toISOString(),
    })),
    { onConflict: "espn_event_id" },
  );
  if (evErr) throw new Error(evErr.message);

  const cutoff = addDays(dates[0], -LIVE_RETENTION_DAYS);
  await sb.from("player_live_games").delete().lt("game_date", cutoff);
  await sb.from("live_game_events").delete().lt("game_date", cutoff);

  return {
    games: games.length,
    live: active.filter((g) => g.state === "in").length,
    fetched: perGame.length,
    written: rows.length,
    unmapped,
    settled,
  };
}

// ---------------------------------------------------------------------------
// 2) Market Price tick -> apply_market_tick()
// ---------------------------------------------------------------------------
async function runTick(sb: SupabaseClient, now: Date) {
  const [states, fvRows, activeRows] = await Promise.all([
    selectAll<MarketStateRow>((a, b) =>
      sb
        .from("player_market_state")
        .select("player_id, market_price, prev_market_price, fair_value, updated_at, explanation")
        .order("player_id")
        .range(a, b)
    ),
    selectAll<{ player_id: number; fair_value: number; last_game_date: string | null }>((a, b) =>
      sb.from("player_fv_state").select("player_id, fair_value, last_game_date").order("player_id")
        .range(a, b)
    ),
    selectAll<{ player_id: number }>((a, b) =>
      sb.from("active_players").select("player_id").order("player_id").range(a, b)
    ),
  ]);

  const active = new Set(activeRows.map((r) => Number(r.player_id)));
  const fvById = new Map(fvRows.map((r) => [Number(r.player_id), r]));

  const since = addDays(scanDates(now)[0], -1);
  const { data: liveRows, error: liveErr } = await sb
    .from("player_live_games")
    .select("player_id, game_date, game_state, progress, base_fair_value, live_fair_value, espn_event_id")
    .gte("game_date", since);
  if (liveErr) throw new Error(liveErr.message);

  // A live row counts until the final box score is ingested into Fair Value.
  const liveById = new Map<number, LiveInfo>();
  for (const r of liveRows ?? []) {
    const pid = Number(r.player_id);
    const last = fvById.get(pid)?.last_game_date ?? null;
    if (last && last >= String(r.game_date)) continue;
    liveById.set(pid, {
      live_fair_value: Number(r.live_fair_value),
      base_fair_value: Number(r.base_fair_value),
      game_state: String(r.game_state),
      progress: Number(r.progress),
      espn_event_id: String(r.espn_event_id),
    });
  }

  const planned: TickRow[] = [];
  for (const s of states) {
    const pid = Number(s.player_id);
    if (active.size > 0 && !active.has(pid)) continue;
    const official = fvById.get(pid)?.fair_value;
    const row = planTick(
      { ...s, player_id: pid },
      official == null ? null : Number(official),
      liveById.get(pid) ?? null,
      now,
    );
    if (row) planned.push(row);
  }

  if (planned.length === 0) {
    return { considered: states.length, planned: 0, applied: 0, live_players: liveById.size };
  }

  const { data: applied, error } = await sb.rpc("apply_market_tick", {
    p_rows: planned,
    p_recorded_at: now.toISOString(),
  });
  if (error) throw new Error(error.message);

  return {
    considered: states.length,
    planned: planned.length,
    applied: applied === -1 ? 0 : applied,
    lease_held: applied === -1,
    live_players: liveById.size,
  };
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("TICK_SECRET");
  if (!secret || req.headers.get("x-tick-secret") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return json({ error: "missing Supabase env" }, 500);

  const sb = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();

  const { data: meta } = await sb
    .from("prices_snapshot_meta")
    .select("market_lease_until")
    .eq("id", 1)
    .maybeSingle();
  if (meta?.market_lease_until && Date.parse(meta.market_lease_until) > now.getTime()) {
    return json({ skipped: "python market step holds the lease" });
  }

  const report: Record<string, unknown> = { at: now.toISOString() };
  try {
    report.live = await refreshLiveGames(sb, now);
  } catch (e) {
    report.live_error = e instanceof Error ? e.message : String(e);
  }
  try {
    report.tick = await runTick(sb, now);
  } catch (e) {
    report.tick_error = e instanceof Error ? e.message : String(e);
    return json(report, 500);
  }
  return json(report);
});
