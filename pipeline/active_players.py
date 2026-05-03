"""
Tradable universe: NBA players currently marked active (has a league listing).

Historical cleaned CSVs intentionally include retired / bench players for charts and
backtests. When you expose prices or order books, filter with this list:

    active_ids = set(active_players.load_active_players_df()["player_id"])

Refresh periodically (e.g. daily or on deploy); no API key required.
"""
from pathlib import Path

import pandas as pd
from nba_api.stats.static import players as static_players

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"


def load_active_players_df() -> pd.DataFrame:
    rows = static_players.get_active_players()
    df = pd.DataFrame(rows)
    df = df.rename(columns={"id": "player_id", "full_name": "player_name"})
    return df[["player_id", "player_name"]].sort_values("player_id").reset_index(drop=True)


def save_active_players(out_path: Path | None = None) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = out_path or (DATA_DIR / "active_players.csv")
    df = load_active_players_df()
    df.to_csv(path, index=False)
    print(f"Saved {len(df)} active players -> {path.relative_to(ROOT)}")
    return path


if __name__ == "__main__":
    save_active_players()
