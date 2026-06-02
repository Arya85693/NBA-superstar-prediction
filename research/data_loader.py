"""Load historical game/price panels for research (read-only)."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

REPO_ROOT = Path(__file__).resolve().parent.parent
_PIPELINE = REPO_ROOT / "pipeline"
if str(_PIPELINE) not in sys.path:
    sys.path.insert(0, str(_PIPELINE))

from config import BacktestConfig, REPO_ROOT  # noqa: E402


def load_active_player_ids(path: Path) -> set[int]:
    if not path.is_file():
        return set()
    df = pd.read_csv(path)
    col = "player_id" if "player_id" in df.columns else df.columns[0]
    ids = pd.to_numeric(df[col], errors="coerce").dropna().astype(int)
    return set(ids.tolist())


def load_prices_from_csv(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, low_memory=False)
    df["game_date"] = pd.to_datetime(df["game_date"], errors="coerce")
    df["player_id"] = pd.to_numeric(df["player_id"], errors="coerce")
    df = df.dropna(subset=["game_date", "player_id", "game_score"])
    df["player_id"] = df["player_id"].astype(int)
    for col in ("minutes", "game_score", "price_after_game"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    df["season"] = df["season"].astype(str)
    df = df.sort_values(["player_id", "game_date", "game_id"], kind="mergesort")
    return df


def build_prices_from_game_logs(game_logs_path: Path) -> pd.DataFrame:
    """Recompute Fair Value via price_engine when prices CSV is missing."""
    import price_engine as pe

    raw = pd.read_csv(game_logs_path, low_memory=False)
    out = pe.compute_prices(raw)
    keep = [c for c in out.columns if not str(c).startswith("_")]
    return out[keep]


def load_evaluation_frame(config: BacktestConfig) -> tuple[pd.DataFrame, dict[str, str]]:
    """
    Returns (game-level panel, metadata about data source).
    """
    meta: dict[str, str] = {}

    def _path_label(p: Path) -> str:
        try:
            return str(p.relative_to(REPO_ROOT))
        except ValueError:
            return str(p)

    if config.data.prices_csv.is_file():
        df = load_prices_from_csv(config.data.prices_csv)
        meta["source"] = _path_label(config.data.prices_csv)
        meta["built_from"] = "player_game_prices.csv"
    elif config.data.game_logs_csv.is_file():
        df = build_prices_from_game_logs(config.data.game_logs_csv)
        meta["source"] = _path_label(config.data.game_logs_csv)
        meta["built_from"] = "price_engine.compute_prices(game_logs)"
    else:
        raise FileNotFoundError(
            "No research data found. Run from repo root:\n"
            "  python pipeline/run_pipeline.py --fetch-balldontlie --active\n"
            f"Expected {config.data.prices_csv} or {config.data.game_logs_csv}"
        )

    if config.universe.seasons:
        allowed = set(config.universe.seasons)
        df = df[df["season"].isin(allowed)]

    if config.universe.active_players_only:
        active = load_active_player_ids(config.data.active_players_csv)
        if active:
            df = df[df["player_id"].isin(active)]

    meta["rows"] = str(len(df))
    meta["players"] = str(df["player_id"].nunique())
    meta["date_min"] = str(df["game_date"].min().date())
    meta["date_max"] = str(df["game_date"].max().date())
    meta["seasons"] = ", ".join(sorted(df["season"].unique()))
    return df, meta
