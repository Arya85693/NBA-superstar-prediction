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

**Between games** — Price remains flat until the player logs another regular-season or playoff game.

Requires: data/cleaned_game_logs_with_game_score.csv

Output: data/player_game_prices.csv
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"

INPUT_CSV = DATA_DIR / "cleaned_game_logs_with_game_score.csv"
OUTPUT_CSV = DATA_DIR / "player_game_prices.csv"

ALPHA = 0.30
EARLY_GAMES_THRESHOLD = 5
EARLY_ALPHA_MULTIPLIER = 0.5
SURPRISE_Z_CAP = 2.0
SURPRISE_ALPHA_MULT = 0.5
SURPRISE_Z_WEIGHT_THRESHOLD = 1.5
WEIGHT_TONIGHT_SURPRISE = 0.40

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


def _season_std(prior_game_scores: list[float]) -> float:
    if len(prior_game_scores) < 2:
        return 8.0
    mean = sum(prior_game_scores) / len(prior_game_scores)
    var = sum((g - mean) ** 2 for g in prior_game_scores) / len(prior_game_scores)
    return max(var**0.5, 3.0)


def surprise_z_score(tonight_gs: float, prior_game_scores: list[float]) -> float:
    """Z-score of tonight vs prior games this season (0 when no prior sample)."""
    if not prior_game_scores:
        return 0.0
    mean = sum(prior_game_scores) / len(prior_game_scores)
    return (tonight_gs - mean) / _season_std(prior_game_scores)


def effective_alpha(
    base_alpha: float,
    games_in_season: int,
    surprise_z: float,
) -> float:
    early = (
        EARLY_ALPHA_MULTIPLIER
        if games_in_season <= EARLY_GAMES_THRESHOLD
        else 1.0
    )
    surprise_boost = 1.0 + min(abs(surprise_z), SURPRISE_Z_CAP) * SURPRISE_ALPHA_MULT
    return base_alpha * early * surprise_boost


def smoothing_target_live(
    game_score: float,
    minutes: float,
    prior_year_mean_gs: float | None,
    season_to_date_mean_gs: float,
    surprise_z: float = 0.0,
) -> float:
    """
    Blend tonight, last year's average (anchor), and **this season's average so far**
    — all mapped to the same dollar band.
    """
    p_game = game_score_to_price(game_score * minutes_factor(minutes))
    p_season = game_score_to_price(season_to_date_mean_gs)

    w_tonight = (
        WEIGHT_TONIGHT_SURPRISE
        if abs(surprise_z) >= SURPRISE_Z_WEIGHT_THRESHOLD
        else WEIGHT_TONIGHT
    )

    if prior_year_mean_gs is not None and not (prior_year_mean_gs != prior_year_mean_gs):
        p_prior = game_score_to_price(float(prior_year_mean_gs))
        remainder = 1.0 - w_tonight
        w_prior = remainder * (WEIGHT_PRIOR_YEAR / (WEIGHT_PRIOR_YEAR + WEIGHT_SEASON_AVG))
        w_season = remainder * (WEIGHT_SEASON_AVG / (WEIGHT_PRIOR_YEAR + WEIGHT_SEASON_AVG))
        return w_tonight * p_game + w_prior * p_prior + w_season * p_season

    w_season = 1.0 - w_tonight
    return w_tonight * p_game + w_season * p_season


def compute_prices(
    df: pd.DataFrame,
    alpha: float = ALPHA,
) -> pd.DataFrame:
    df = df.copy()
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df = df.dropna(subset=["game_date", "player_id", "game_score"])
    if "game_id" in df.columns:
        df = df.drop_duplicates(subset=["player_id", "game_id"], keep="last")
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
        season_gs_sum = 0.0
        season_gs_history: list[float] = []

        for _, row in g.iterrows():
            sea = str(row["season"])
            gs = float(row["game_score"])
            pm = row["_prior_mean_gs"]
            prior_val = float(pm) if pd.notna(pm) else None
            mins = float(row["minutes"])

            if current_season != sea:
                current_season = sea
                games_in_season = 0
                season_gs_sum = 0.0
                season_gs_history = []
                ipo_this_season = ipo_map.get((int(pid), sea), DEFAULT_IPO_PRICE)
                price = ipo_this_season

            surprise_z = surprise_z_score(gs, season_gs_history)
            games_in_season += 1
            season_gs_sum += gs
            season_avg_gs = season_gs_sum / games_in_season
            season_gs_history.append(gs)

            alpha_eff = effective_alpha(alpha, games_in_season, surprise_z)
            target = smoothing_target_live(
                gs, mins, prior_val, season_avg_gs, surprise_z=surprise_z,
            )
            price = (1.0 - alpha_eff) * price + alpha_eff * target
            price = min(PRICE_CEILING, max(PRICE_FLOOR, price))
            prices.append(price)
            ipos_out.append(ipo_this_season)

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

    if not run_validation(out_df["price_after_game"], csv_path=OUTPUT_CSV, df=out_df):
        sys.exit(1)
