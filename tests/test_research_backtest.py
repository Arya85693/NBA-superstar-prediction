"""Research framework smoke tests with synthetic game logs (no API / CSV required)."""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd
import pytest

REPO = Path(__file__).resolve().parent.parent
RESEARCH = REPO / "research"
PIPELINE = REPO / "pipeline"
for p in (str(RESEARCH), str(PIPELINE)):
    if p not in sys.path:
        sys.path.insert(0, p)


def _synthetic_prices_csv(tmp_path: Path) -> Path:
    """Minimal panel: two players, improving vs declining recent form."""
    import price_engine as pe

    rows = []
    base_date = pd.Timestamp("2024-10-15")
    for pid, name, trend in [
        (1, "Alpha Star", 1.5),
        (2, "Beta Slump", -1.2),
    ]:
        gs = 12.0
        for g in range(30):
            gs = max(0.5, gs + trend + (g % 3) * 0.2)
            rows.append(
                {
                    "player_id": pid,
                    "player_name": name,
                    "team_abbr": "TST",
                    "game_id": f"{pid}-{g}",
                    "game_date": base_date + pd.Timedelta(days=g * 2),
                    "season": "2024-25",
                    "minutes": 32.0,
                    "game_score": gs,
                }
            )
    raw = pd.DataFrame(rows)
    priced = pe.compute_prices(raw)
    out = tmp_path / "player_game_prices.csv"
    priced.to_csv(out, index=False)
    return out


@pytest.fixture
def synthetic_config(tmp_path):
    from config import (
        BacktestConfig,
        DataConfig,
        HorizonConfig,
        OutputsConfig,
        PortfolioConfig,
        UniverseConfig,
    )

    prices = _synthetic_prices_csv(tmp_path)
    active = tmp_path / "active_players.csv"
    pd.DataFrame({"player_id": [1, 2]}).to_csv(active, index=False)

    cfg = BacktestConfig(
        name="synthetic_test",
        data=DataConfig(
            prices_csv=prices,
            game_logs_csv=tmp_path / "missing.csv",
            active_players_csv=active,
        ),
        horizon=HorizonConfig(
            forward_games=3,
            min_season_games_before_signal=5,
            require_same_season_forward=True,
        ),
        universe=UniverseConfig(
            active_players_only=False,
            min_games_per_player_season=15,
        ),
        portfolio=PortfolioConfig(top_n_holdings=2, rebalance_every_games=3),
        outputs=OutputsConfig(
            run_id="test_run",
            write_plots=False,
        ),
    )
    return cfg


def test_backtest_runner_produces_artifacts(synthetic_config, tmp_path):
    from backtests.runner import run_backtest

    synthetic_config.outputs.run_id = "pytest_" + tmp_path.name[:8]
    results = run_backtest(synthetic_config)

    out = Path(results["output_dir"])
    assert (out / "evaluation_panel.csv").is_file()
    assert (out / "signal_evaluation_summary.csv").is_file()
    report = Path(results["report_dir"]) / "BACKTEST_REPORT.md"
    assert report.is_file()
    assert results["evaluable_rows"] > 0

    summary = pd.read_csv(out / "signal_evaluation_summary.csv")
    assert "spearman_mean" in summary.columns
    assert len(summary) >= 3


def test_projection_signal_range(synthetic_config):
    from backtests.runner import build_panel
    from data_loader import load_evaluation_frame

    raw, _ = load_evaluation_frame(synthetic_config)
    panel = build_panel(raw, synthetic_config)
    assert panel["signal_projection"].between(-1, 1).all()
