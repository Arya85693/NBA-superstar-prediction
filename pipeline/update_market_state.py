"""
Update the Market Price layer (Layer 2).

Runs every ingestion cycle, AFTER Fair Value has been synced. Unlike Fair Value
(recomputed from scratch each run), Market Price has *memory*: this step reads
the previous Market Price from Supabase, nudges it toward a Fair-Value-anchored
target using the projection / sentiment / team-context / demand levers, applies
mean reversion + caps, and upserts the new state. That is what lets price keep
moving between games and during the offseason — without ever moving randomly.

Data sources
------------
- ``data/player_game_prices.csv``  Fair Value + game history (just produced by
  run_pipeline.py in the same CI run — cheap local read, no heavy DB scan).
- ``public.player_market_state``    previous Market Price per player (continuity).
- ``public.trades``                 recent fills -> demand (defaults to 0 / none).

Outputs
-------
- Upserts ``public.player_market_state`` (current) and
  ``public.player_market_history`` (today's row), then bumps market_revision.
- Also writes ``data/player_market_state.csv`` for local inspection / local web.

Run from repo root after sync:
    python pipeline/update_market_state.py
"""
from __future__ import annotations

import csv
import os
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
_PIPELINE_DIR = Path(__file__).resolve().parent
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))

from demand_engine import build_demand_window, compute_demand  # noqa: E402
from espn_injuries import fetch_injuries, normalize_name  # noqa: E402
from news_sentiment import fetch_news_sentiment  # noqa: E402
from market_config import DEFAULT_CONFIG, MarketConfig  # noqa: E402
from market_engine import compute_market_price  # noqa: E402
from projection_engine import GameStat, compute_projection  # noqa: E402
from sentiment_engine import (  # noqa: E402
    SentimentInput,
    SentimentResult,
    compute_sentiment,
)
from team_context_engine import (  # noqa: E402
    TeamContextInput,
    compute_team_context,
)

PRICES_CSV = REPO_ROOT / "data" / "player_game_prices.csv"
ACTIVE_CSV = REPO_ROOT / "data" / "active_players.csv"
MARKET_STATE_CSV = REPO_ROOT / "data" / "player_market_state.csv"

BATCH = 500


# ---------------------------------------------------------------------------
# Pure assembly (unit-tested): inputs -> market state rows
# ---------------------------------------------------------------------------
def build_player_market_row(
    *,
    player_id: int,
    player_name: str,
    team_abbr: str,
    fair_value: float,
    prev_market_price: float | None,
    season_games: list[GameStat],
    prior_season_avg_game_score: float | None,
    demand_trades: list[dict] | None,
    as_of_date: str,
    team_context_input: TeamContextInput | None = None,
    sentiment_input: SentimentInput | None = None,
    prev_sentiment_score: float | None = None,
    config: MarketConfig = DEFAULT_CONFIG,
) -> dict[str, Any]:
    """Compute a full player_market_state row for one player (no I/O)."""
    projection = compute_projection(
        season_games,
        prior_season_avg_game_score=prior_season_avg_game_score,
    )
    # Sentiment: ESPN injuries + RSS news, confidence-scaled by article count.
    sentiment = compute_sentiment(
        sentiment_input,
        full_confidence_articles=config.sentiment_full_confidence_articles,
    )
    # Cross-cycle smoothing (EMA): blend fresh sentiment with the prior cycle's so
    # price doesn't whipsaw on a single new article and stale news fades to 0.
    if prev_sentiment_score is not None and prev_sentiment_score == prev_sentiment_score:
        a = config.sentiment_smoothing
        smoothed = a * sentiment.score + (1.0 - a) * float(prev_sentiment_score)
        sentiment = SentimentResult(
            score=max(-1.0, min(1.0, smoothed)),
            signals=sentiment.signals,
            notes=sentiment.notes,
        )
    team_context = compute_team_context(team_context_input)  # team win pct (live)
    demand_window = build_demand_window(demand_trades or [], config)
    demand = compute_demand(demand_window, config)

    result = compute_market_price(
        fair_value=fair_value,
        prev_market_price=prev_market_price,
        projection=projection,
        sentiment=sentiment,
        team_context=team_context,
        demand=demand,
        config=config,
    )

    levers = result.levers
    return {
        "player_id": int(player_id),
        "player_name": player_name[:512],
        "team_abbr": team_abbr[:16],
        "fair_value": round(result.fair_value, 4),
        "market_price": round(result.market_price, 4),
        "prev_market_price": round(result.prev_market_price, 4),
        "premium_pct": round(result.premium_pct, 6),
        "change": round(result.change, 4),
        "change_pct": (
            round(result.change_pct, 6) if result.change_pct is not None else None
        ),
        "projection_score": round(levers["projection"].score, 6),
        "projection_adjustment": round(levers["projection"].adjustment_pct, 6),
        "sentiment_score": round(levers["sentiment"].score, 6),
        "sentiment_adjustment": round(levers["sentiment"].adjustment_pct, 6),
        "team_context_score": round(levers["team_context"].score, 6),
        "team_context_adjustment": round(levers["team_context"].adjustment_pct, 6),
        "demand_score": round(levers["demand"].score, 6),
        "demand_adjustment": round(levers["demand"].adjustment_pct, 6),
        "net_demand": round(demand.net_demand, 4),
        "recent_buy_volume": round(demand.recent_buy_volume, 4),
        "recent_sell_volume": round(demand.recent_sell_volume, 4),
        "demand_weight": round(demand.demand_weight, 6),
        "move_capped": bool(result.move_capped),
        "premium_capped": bool(result.premium_capped),
        "explanation": result.explanation(),
        "as_of_date": as_of_date,
    }


# ---------------------------------------------------------------------------
# Local data loading
# ---------------------------------------------------------------------------
def _load_env_file(path: Path) -> None:
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, value = stripped.split("=", 1)
        key = key.strip()
        if key:
            os.environ.setdefault(key, value.strip())


def _supabase_env() -> tuple[str | None, str | None]:
    _load_env_file(REPO_ROOT / "web" / ".env.local")
    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    return url, key


def load_fair_value_frame() -> pd.DataFrame:
    # `result` / `game_id` are optional (older CSVs may lack them) and only used
    # to derive team win pct for the team-context lever — so read them when
    # present but never fail if they're missing.
    available = set(pd.read_csv(PRICES_CSV, nrows=0).columns)
    base_cols = [
        "player_id", "player_name", "team_abbr", "game_date", "season",
        "minutes", "game_score", "price_after_game", "prior_season_avg_game_score",
    ]
    optional = [c for c in ("result", "game_id") if c in available]
    df = pd.read_csv(
        PRICES_CSV,
        usecols=base_cols + optional,
        dtype={"season": str},
        low_memory=False,
    )
    df["player_id"] = pd.to_numeric(df["player_id"], errors="coerce")
    df = df.dropna(subset=["player_id"])
    df["player_id"] = df["player_id"].astype("int64")
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["game_date"])
    for col in ("minutes", "game_score", "price_after_game"):
        df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0.0)
    df = df.sort_values(["player_id", "game_date"], kind="mergesort")
    return df


def injury_signal_active(
    player_last_game: date | None,
    ref_game_date: date | None,
    as_of: date,
    window_days: int,
) -> bool:
    """
    Should the injury discount apply to this player right now?

    False when basketball isn't actively being played — either the whole league
    has been idle longer than ``window_days`` (offseason) or this player hasn't
    appeared in a game within ``window_days`` of the latest league game
    (eliminated / inactive / season-ending injury already priced). This stops
    "Out" from discounting nearly every player in July and benched/eliminated
    players in the playoffs.
    """
    if ref_game_date is None or player_last_game is None:
        return False
    if (as_of - ref_game_date).days > window_days:
        return False  # league offseason / long idle
    if (ref_game_date - player_last_game).days > window_days:
        return False  # player not in current rotation
    return True


def compute_team_win_pct(df: pd.DataFrame) -> dict[str, float]:
    """
    Team win pct for the current season, derived from ingested game results.

    Each player-game row carries that game's W/L for the player's team, so we
    dedupe to one row per (team, game) and count wins. No extra API call and no
    BALLDONTLIE tier requirement — the data is already in Fair Value's CSV.
    Returns {} when `result` isn't available so team context stays neutral.
    """
    if "result" not in df.columns or "game_id" not in df.columns:
        return {}
    if df.empty:
        return {}

    # Current season = the most recent season present in the data.
    current_season = str(df["season"].dropna().max())
    season_df = df[df["season"].astype(str) == current_season].copy()
    if season_df.empty:
        return {}

    season_df["result"] = season_df["result"].astype(str).str.strip().str.upper()
    season_df = season_df[season_df["result"].isin(["W", "L"])]
    if season_df.empty:
        return {}

    # One row per team per game (all of a team's players share that game's result).
    games = season_df.drop_duplicates(subset=["team_abbr", "game_id"])
    out: dict[str, float] = {}
    for team, g in games.groupby("team_abbr"):
        team = str(team).strip()
        if not team:
            continue
        total = len(g)
        if total == 0:
            continue
        wins = int((g["result"] == "W").sum())
        out[team] = wins / total
    return out


def load_active_ids() -> set[int]:
    if not ACTIVE_CSV.is_file():
        return set()
    out: set[int] = set()
    with ACTIVE_CSV.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if not row:
                continue
            try:
                out.add(int(float(row[0])))
            except (ValueError, IndexError):
                continue
    return out


def assemble_inputs_for_players(
    df: pd.DataFrame,
    active_ids: set[int],
) -> dict[int, dict[str, Any]]:
    """Latest fair value + current-season game stats + anchor, per active player."""
    out: dict[int, dict[str, Any]] = {}
    for pid, g in df.groupby("player_id", sort=False):
        pid = int(pid)
        if active_ids and pid not in active_ids:
            continue
        last = g.iloc[-1]
        max_season = str(last["season"])
        season_rows = g[g["season"] == max_season]
        season_games = [
            GameStat(game_score=float(r.game_score), minutes=float(r.minutes))
            for r in season_rows.itertuples(index=False)
        ]
        anchor = last.get("prior_season_avg_game_score")
        anchor_val = float(anchor) if pd.notna(anchor) else None
        out[pid] = {
            "player_name": str(last.get("player_name") or ""),
            "team_abbr": str(last.get("team_abbr") or ""),
            "fair_value": float(last["price_after_game"]),
            "season_games": season_games,
            "prior_season_avg_game_score": anchor_val,
        }
    return out


# ---------------------------------------------------------------------------
# Supabase I/O
# ---------------------------------------------------------------------------
def fetch_prev_market_state(client) -> tuple[dict[int, float], dict[int, float]]:
    """Returns (prev_market_price, prev_sentiment_score) maps for continuity."""
    prices: dict[int, float] = {}
    sentiments: dict[int, float] = {}
    page = 1000
    start = 0
    while True:
        resp = (
            client.table("player_market_state")
            .select("player_id, market_price, sentiment_score")
            .range(start, start + page - 1)
            .execute()
        )
        data = resp.data or []
        if not data:
            break
        for r in data:
            try:
                pid = int(r["player_id"])
                prices[pid] = float(r["market_price"])
            except (TypeError, ValueError, KeyError):
                continue
            try:
                if r.get("sentiment_score") is not None:
                    sentiments[pid] = float(r["sentiment_score"])
            except (TypeError, ValueError):
                pass
        if len(data) < page:
            break
        start += page
    return prices, sentiments


def fetch_recent_trades(client, window_days: int) -> dict[int, list[dict]]:
    """player_id -> [{'side','shares','age_days','user'}] within the lookback window.

    ``user`` is the portfolio_id so the demand engine can cap each distinct
    user's contribution (anti-manipulation).
    """
    by_player: dict[int, list[dict]] = {}
    now = datetime.now(timezone.utc)
    cutoff = now.timestamp() - window_days * 86400
    page = 1000
    start = 0
    while True:
        resp = (
            client.table("trades")
            .select("player_id, side, shares, created_at, portfolio_id")
            .order("created_at", desc=True)
            .range(start, start + page - 1)
            .execute()
        )
        data = resp.data or []
        if not data:
            break
        stop = False
        for r in data:
            created = r.get("created_at")
            ts = _parse_ts(created)
            if ts is None:
                continue
            if ts < cutoff:
                stop = True
                break
            age_days = max(0.0, (now.timestamp() - ts) / 86400.0)
            try:
                pid = int(r["player_id"])
            except (TypeError, ValueError, KeyError):
                continue
            by_player.setdefault(pid, []).append(
                {
                    "side": r.get("side"),
                    "shares": r.get("shares"),
                    "age_days": age_days,
                    "user": r.get("portfolio_id"),
                }
            )
        if stop or len(data) < page:
            break
        start += page
    return by_player


def _parse_ts(value: Any) -> float | None:
    if not value:
        return None
    s = str(value).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s).timestamp()
    except ValueError:
        try:
            return datetime.fromisoformat(s.split(".")[0] + "+00:00").timestamp()
        except ValueError:
            return None


def write_local_csv(rows: list[dict[str, Any]]) -> None:
    import json

    if not rows:
        return
    fields = [k for k in rows[0].keys() if k != "explanation"] + ["explanation"]
    with MARKET_STATE_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for r in rows:
            out = {k: r.get(k) for k in fields}
            out["explanation"] = json.dumps(r.get("explanation") or {})
            writer.writerow(out)
    print(f"  wrote {len(rows)} rows -> {MARKET_STATE_CSV.relative_to(REPO_ROOT)}")


def main() -> None:
    if not PRICES_CSV.is_file():
        print(f"Missing {PRICES_CSV}. Run pipeline/run_pipeline.py first.", file=sys.stderr)
        sys.exit(1)

    config = DEFAULT_CONFIG
    as_of = datetime.now(timezone.utc).date().isoformat()

    df = load_fair_value_frame()
    active_ids = load_active_ids()
    inputs = assemble_inputs_for_players(df, active_ids)
    print(f"Market layer: {len(inputs)} active players with Fair Value.")

    team_win_pct = compute_team_win_pct(df)
    if team_win_pct:
        print(f"  team context: win pct for {len(team_win_pct)} teams (current season).")
    else:
        print("  team context: no W/L data found — staying neutral.")

    injuries = fetch_injuries()  # fail-safe: {} on any error -> neutral sentiment
    if injuries:
        print(f"  sentiment: {len(injuries)} injured players from ESPN feed.")
    else:
        print("  sentiment: no injury data (feed empty/unavailable) — staying neutral.")

    # Reference dates for the offseason / not-playing injury gate.
    as_of_date_obj = datetime.fromisoformat(as_of).date()
    ref_game_date = (
        df["game_date"].max().date() if not df["game_date"].isna().all() else None
    )
    last_game_by_player = {
        int(pid): ts.date()
        for pid, ts in df.groupby("player_id")["game_date"].max().items()
        if pd.notna(ts)
    }
    if ref_game_date is not None:
        league_idle_days = (as_of_date_obj - ref_game_date).days
        if league_idle_days > config.injury_active_window_days:
            print(
                f"  sentiment: league idle {league_idle_days}d (> "
                f"{config.injury_active_window_days}d) — injury discounts off (offseason)."
            )

    player_names = [info["player_name"] for info in inputs.values()]
    news = fetch_news_sentiment(player_names)  # fail-safe: {} -> neutral headlines
    if news:
        print(f"  sentiment: news headlines matched {len(news)} players (RSS feeds).")
    else:
        print("  sentiment: no news matches (feeds empty/unavailable) — staying neutral.")

    url, key = _supabase_env()
    client = None
    prev_prices: dict[int, float] = {}
    prev_sentiment: dict[int, float] = {}
    trades_by_player: dict[int, list[dict]] = {}

    if url and key:
        from supabase import create_client

        client = create_client(url, key)
        try:
            prev_prices, prev_sentiment = fetch_prev_market_state(client)
            print(f"  loaded {len(prev_prices)} previous Market Prices.")
        except Exception as e:  # noqa: BLE001 - first run before table exists
            print(f"  (no previous Market Price state yet: {e})")
        try:
            trades_by_player = fetch_recent_trades(client, config.demand_window_days)
            print(f"  loaded recent trades for {len(trades_by_player)} players.")
        except Exception as e:  # noqa: BLE001
            print(f"  (skipping demand — trades unavailable: {e})")
    else:
        # Local fallback: reuse previous local CSV for continuity if present.
        if MARKET_STATE_CSV.is_file():
            prev_df = pd.read_csv(MARKET_STATE_CSV)
            has_sent = "sentiment_score" in prev_df.columns
            for r in prev_df.itertuples(index=False):
                try:
                    prev_prices[int(r.player_id)] = float(r.market_price)
                except (TypeError, ValueError):
                    continue
                if has_sent:
                    try:
                        prev_sentiment[int(r.player_id)] = float(r.sentiment_score)
                    except (TypeError, ValueError):
                        pass
        print("  SUPABASE creds not set — local CSV-only run (demand defaults to 0).")

    rows: list[dict[str, Any]] = []
    for pid, info in inputs.items():
        team_abbr = info["team_abbr"]
        wp = team_win_pct.get(team_abbr)
        team_input = (
            TeamContextInput(team_win_pct=wp) if wp is not None else None
        )

        name_key = normalize_name(info["player_name"])
        injury = injuries.get(name_key) if injuries else None
        # Drop stale "Out" tags when basketball isn't being played (offseason) or
        # the player isn't in the current rotation (eliminated / inactive).
        if injury is not None and not injury_signal_active(
            last_game_by_player.get(pid),
            ref_game_date,
            as_of_date_obj,
            config.injury_active_window_days,
        ):
            injury = None
        player_news = news.get(name_key) if news else None
        sentiment_input = None
        if injury or player_news is not None:
            top_headline = (
                player_news.headlines[0]["title"]
                if player_news and player_news.headlines
                else None
            )
            sentiment_input = SentimentInput(
                injury_severity=injury["severity"] if injury else None,
                injury_status=injury["status"] if injury else None,
                headline_score=player_news.score if player_news else None,
                article_count=player_news.article_count if player_news else 0,
                top_headline=top_headline,
            )

        rows.append(
            build_player_market_row(
                player_id=pid,
                player_name=info["player_name"],
                team_abbr=team_abbr,
                fair_value=info["fair_value"],
                prev_market_price=prev_prices.get(pid),
                season_games=info["season_games"],
                prior_season_avg_game_score=info["prior_season_avg_game_score"],
                demand_trades=trades_by_player.get(pid),
                as_of_date=as_of,
                team_context_input=team_input,
                sentiment_input=sentiment_input,
                prev_sentiment_score=prev_sentiment.get(pid),
                config=config,
            )
        )

    write_local_csv(rows)

    if client is None:
        print("Done (local CSV only). Set SUPABASE_* to publish Market Price.")
        return

    print("Upserting player_market_state …")
    for i in range(0, len(rows), BATCH):
        chunk = rows[i : i + BATCH]
        client.table("player_market_state").upsert(
            chunk, on_conflict="player_id"
        ).execute()
        print(f"  upserted {min(i + BATCH, len(rows))}/{len(rows)}")

    print("Upserting player_market_history (today) …")
    history = [
        {
            "player_id": r["player_id"],
            "as_of_date": r["as_of_date"],
            "market_price": r["market_price"],
            "fair_value": r["fair_value"],
            "premium_pct": r["premium_pct"],
        }
        for r in rows
    ]
    for i in range(0, len(history), BATCH):
        chunk = history[i : i + BATCH]
        client.table("player_market_history").upsert(
            chunk, on_conflict="player_id,as_of_date"
        ).execute()

    client.rpc("bump_market_revision", {}).execute()
    print("Done. Market Price published; market_revision bumped.")


if __name__ == "__main__":
    main()
