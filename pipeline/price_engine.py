"""
Player "stock" price from game-level Hollinger game_score.

**Season open (IPO)** — Anchored to **last season’s productivity**, not a single hot streak:
  - **League percentile** of an **minutes-adjusted** prior-season mean game_score (role players
    who play fewer MPG get scaled down before ranking, so they don’t price next to MVPs).
  - Blended with a **direct dollar mapping** of that same adjusted prior average — matches the
    idea “start-of-season price comes from last season’s averages.”

**Each game (live path through history)** — Price updates from a blend of:
  - tonight’s game (minutes-damped),
  - **prior-season average** game_score (reputation anchor),
  - **season-to-date average** game_score (what they’ve actually done *this* year so far).

**Long gaps without games** — Same-season injury/rest pulls paper price toward an inactive band
before the next logged game (stronger than earlier versions).

Requires: data/cleaned_game_logs_with_game_score.csv

Output: data/player_game_prices.csv
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

INPUT_CSV = DATA_DIR / "cleaned_game_logs_with_game_score.csv"
OUTPUT_CSV = DATA_DIR / "player_game_prices.csv"

ALPHA = 0.25
EARLY_GAMES_THRESHOLD = 5
EARLY_ALPHA_MULTIPLIER = 0.5

PRICE_MIN = 45.0
PRICE_MAX = 185.0

ROOKIE_IPO_FRAC = 0.12
ROOKIE_IPO_PRICE = PRICE_MIN + ROOKIE_IPO_FRAC * (PRICE_MAX - PRICE_MIN)

MIN_PRIOR_GAMES = 25
MIN_GAMES_FOR_LEAGUE_RANK = 20

# IPO = blend(league percentile dollars, map(last season adjusted avg))
IPO_PCT_WEIGHT = 0.45
IPO_AVG_MAP_WEIGHT = 0.55

# Live update blend (sum = 1): tonight / prior year / season-to-date average
WEIGHT_TONIGHT = 0.30
WEIGHT_PRIOR_YEAR = 0.35
WEIGHT_SEASON_AVG = 0.35

GS_MAP_LO = -3.0
GS_MAP_HI = 34.0

MINUTES_REF = 34.0
MIN_MINUTES_FACTOR = 0.22
MAX_MINUTES_FACTOR = 1.08

# Prior-season volume curve for IPO ranking & avg mapping (lower MPG ⇒ lower anchor).
PRIOR_MPG_REF = 32.0
PRIOR_MPG_EXPONENT = 1.2

# --- Absence (same season) ---
INACTIVITY_GAP_DAYS = 8
INACTIVE_PRICE_FRAC = 0.20
INACTIVE_ANCHOR_PRICE = PRICE_MIN + INACTIVE_PRICE_FRAC * (PRICE_MAX - PRICE_MIN)
ABSENCE_DECAY_K = 0.32
MAX_ABSENCE_WEEKS = 24.0

DEFAULT_IPO_PRICE = ROOKIE_IPO_PRICE

PRICE_FLOOR = 0.0
PRICE_CEILING = PRICE_MAX + 55.0


def prior_season_label(season: str) -> str | None:
    try:
        start_y = int(str(season).split("-")[0])
    except (ValueError, IndexError):
        return None
    py = start_y - 1
    return f"{py}-{str(py + 1)[-2:]}"


def mean_game_score_by_player_season(df: pd.DataFrame) -> pd.DataFrame:
    return (
        df.groupby(["player_id", "season"], sort=False)
        .agg(
            mean_game_score=("game_score", "mean"),
            games=("game_score", "count"),
            mean_minutes=("minutes", "mean"),
        )
        .reset_index()
    )


def prior_adjusted_mean_gs(mean_gs: float, mean_mpg: float) -> float:
    """
    Down-weight seasons with lower minutes so reserve / specialist profiles don't IPO
    alongside full-time stars solely on per-minute efficiency.
    """
    mp = max(0.0, min(float(mean_mpg), 40.0))
    vol = min(1.0, (mp / PRIOR_MPG_REF) ** PRIOR_MPG_EXPONENT)
    return float(mean_gs) * vol


def build_prior_mean_lookup(ps: pd.DataFrame) -> dict[tuple[int, str], float]:
    return {
        (int(r.player_id), str(r.season)): float(r.mean_game_score)
        for r in ps.itertuples(index=False)
    }


def build_prior_games_lookup(ps: pd.DataFrame) -> dict[tuple[int, str], int]:
    return {
        (int(r.player_id), str(r.season)): int(r.games)
        for r in ps.itertuples(index=False)
    }


def build_prior_mpg_lookup(ps: pd.DataFrame) -> dict[tuple[int, str], float]:
    return {
        (int(r.player_id), str(r.season)): float(r.mean_minutes)
        for r in ps.itertuples(index=False)
    }


def build_league_prior_percentile_lookup(ps: pd.DataFrame) -> dict[tuple[int, str], float]:
    """Percentile ranks **adjusted** prior-season mean GS (volume-aware)."""
    out: dict[tuple[int, str], float] = {}
    for season in ps["season"].unique():
        sub = ps[
            (ps["season"] == season) & (ps["games"] >= MIN_GAMES_FOR_LEAGUE_RANK)
        ].copy()
        if sub.empty:
            continue
        sub["adj_prior"] = sub.apply(
            lambda r: prior_adjusted_mean_gs(
                float(r.mean_game_score), float(r.mean_minutes)
            ),
            axis=1,
        )
        sub["pct_rank"] = sub["adj_prior"].rank(pct=True, method="average")
        for r in sub.itertuples(index=False):
            out[(int(r.player_id), str(season))] = float(r.pct_rank)
    return out


def game_score_to_price(gs: float) -> float:
    if gs != gs:
        return DEFAULT_IPO_PRICE
    span = GS_MAP_HI - GS_MAP_LO
    if span <= 0:
        return DEFAULT_IPO_PRICE
    t = (gs - GS_MAP_LO) / span
    t = max(0.0, min(1.0, t))
    return PRICE_MIN + t * (PRICE_MAX - PRICE_MIN)


def compute_ipo_per_player_season(
    ps: pd.DataFrame,
    prior_mean_lookup: dict[tuple[int, str], float],
    prior_games_lookup: dict[tuple[int, str], int],
    prior_mpg_lookup: dict[tuple[int, str], float],
    league_pct_lookup: dict[tuple[int, str], float],
) -> pd.DataFrame:
    """IPO blends percentile standing with explicit mapped prior-season average."""
    keys = ps[["player_id", "season"]].drop_duplicates()
    ipo_map: dict[tuple[int, str], float] = {}

    for r in keys.itertuples(index=False):
        pid, season = int(r.player_id), str(r.season)
        prev = prior_season_label(season)
        ipo = DEFAULT_IPO_PRICE

        if prev:
            pm = prior_mean_lookup.get((pid, prev))
            pg = prior_games_lookup.get((pid, prev), 0)
            mpg = prior_mpg_lookup.get((pid, prev))
            if pm is not None and pg >= MIN_PRIOR_GAMES and mpg is not None:
                adj = prior_adjusted_mean_gs(pm, mpg)
                ipo_avg_part = game_score_to_price(adj)
                pct = league_pct_lookup.get((pid, prev))
                if pct is not None:
                    ipo_pct_part = PRICE_MIN + pct * (PRICE_MAX - PRICE_MIN)
                    ipo = IPO_PCT_WEIGHT * ipo_pct_part + IPO_AVG_MAP_WEIGHT * ipo_avg_part
                else:
                    ipo = ipo_avg_part
        ipo_map[(pid, season)] = float(ipo)

    out = keys.merge(
        pd.DataFrame(
            [(k[0], k[1], v) for k, v in ipo_map.items()],
            columns=["player_id", "season", "ipo_price"],
        ),
        on=["player_id", "season"],
        how="left",
    )
    return out


def minutes_factor(minutes: float) -> float:
    if not (minutes == minutes) or minutes <= 0:
        return MIN_MINUTES_FACTOR
    r = minutes / MINUTES_REF
    return max(MIN_MINUTES_FACTOR, min(MAX_MINUTES_FACTOR, r))


def decay_price_for_absence(price: float, delta_days: int, season_ipo: float) -> float:
    if delta_days <= INACTIVITY_GAP_DAYS:
        return price
    extra_days = delta_days - INACTIVITY_GAP_DAYS
    weeks = min(extra_days / 7.0, MAX_ABSENCE_WEEKS)
    blend_target = 0.72 * INACTIVE_ANCHOR_PRICE + 0.28 * season_ipo
    shrink = math.exp(-weeks * ABSENCE_DECAY_K)
    new_price = blend_target + (price - blend_target) * shrink
    return min(PRICE_CEILING, max(PRICE_FLOOR, new_price))


def smoothing_target_live(
    game_score: float,
    minutes: float,
    prior_year_mean_gs: float | None,
    season_to_date_mean_gs: float,
) -> float:
    """
    Blend tonight, last year's average (anchor), and **this season's average so far**
    — all mapped to the same dollar band.
    """
    p_game = game_score_to_price(game_score * minutes_factor(minutes))
    p_season = game_score_to_price(season_to_date_mean_gs)

    if prior_year_mean_gs is not None and not (prior_year_mean_gs != prior_year_mean_gs):
        p_prior = game_score_to_price(float(prior_year_mean_gs))
        return (
            WEIGHT_TONIGHT * p_game
            + WEIGHT_PRIOR_YEAR * p_prior
            + WEIGHT_SEASON_AVG * p_season
        )

    return 0.48 * p_game + 0.52 * p_season


def compute_prices(
    df: pd.DataFrame,
    alpha: float = ALPHA,
) -> pd.DataFrame:
    df = df.copy()
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["game_date", "player_id", "game_score"])
    df = df.sort_values(["player_id", "game_date", "game_id"], kind="mergesort")

    if "minutes" not in df.columns:
        df["minutes"] = 28.0
    df["minutes"] = pd.to_numeric(df["minutes"], errors="coerce").fillna(26.0)

    ps = mean_game_score_by_player_season(df)
    prior_mean_lookup = build_prior_mean_lookup(ps)
    prior_games_lookup = build_prior_games_lookup(ps)
    prior_mpg_lookup = build_prior_mpg_lookup(ps)
    league_pct_lookup = build_league_prior_percentile_lookup(ps)

    ipo_df = compute_ipo_per_player_season(
        ps,
        prior_mean_lookup,
        prior_games_lookup,
        prior_mpg_lookup,
        league_pct_lookup,
    )
    ipo_map = {
        (int(r.player_id), str(r.season)): float(r.ipo_price)
        for r in ipo_df.itertuples(index=False)
    }

    prior_gs_row: list[float | None] = []
    for _, row in df.iterrows():
        pid, sea = int(row["player_id"]), str(row["season"])
        prev = prior_season_label(sea)
        pm = prior_mean_lookup.get((pid, prev)) if prev else None
        prior_gs_row.append(pm)

    df["_prior_mean_gs"] = prior_gs_row

    prices: list[float] = []
    ipos_out: list[float] = []

    for pid, g in df.groupby("player_id", sort=False):
        current_season: str | None = None
        price = DEFAULT_IPO_PRICE
        ipo_this_season = DEFAULT_IPO_PRICE
        games_in_season = 0
        prev_game_date: pd.Timestamp | None = None
        season_gs_sum = 0.0

        for _, row in g.iterrows():
            sea = str(row["season"])
            gs = float(row["game_score"])
            pm = row["_prior_mean_gs"]
            prior_val = float(pm) if pd.notna(pm) else None
            mins = float(row["minutes"])
            gd = pd.Timestamp(row["game_date"])

            if current_season != sea:
                current_season = sea
                games_in_season = 0
                season_gs_sum = 0.0
                ipo_this_season = ipo_map.get((int(pid), sea), DEFAULT_IPO_PRICE)
                price = ipo_this_season
                prev_game_date = None

            if prev_game_date is not None:
                delta_days = int((gd - prev_game_date).days)
                if delta_days > INACTIVITY_GAP_DAYS:
                    price = decay_price_for_absence(price, delta_days, ipo_this_season)

            games_in_season += 1
            season_gs_sum += gs
            season_avg_gs = season_gs_sum / games_in_season

            alpha_eff = alpha * (
                EARLY_ALPHA_MULTIPLIER
                if games_in_season <= EARLY_GAMES_THRESHOLD
                else 1.0
            )
            target = smoothing_target_live(gs, mins, prior_val, season_avg_gs)
            price = (1.0 - alpha_eff) * price + alpha_eff * target
            price = min(PRICE_CEILING, max(PRICE_FLOOR, price))
            prices.append(price)
            ipos_out.append(ipo_this_season)
            prev_game_date = gd

    df["season_open_anchor"] = ipos_out
    df["price_after_game"] = prices
    df = df.rename(columns={"_prior_mean_gs": "prior_season_avg_game_score"})
    return df


if __name__ == "__main__":
    raw = pd.read_csv(INPUT_CSV)
    out_df = compute_prices(raw)
    keep_cols = [c for c in out_df.columns if not str(c).startswith("_")]
    out_df[keep_cols].to_csv(OUTPUT_CSV, index=False)
    print(f"Wrote {out_df.shape} -> {OUTPUT_CSV.relative_to(ROOT)}")
    from validate_prices import run_validation

    if not run_validation(out_df["price_after_game"], csv_path=OUTPUT_CSV):
        sys.exit(1)
