"""Load and validate backtest configuration."""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "default.yaml"


@dataclass
class DataConfig:
    prices_csv: Path
    game_logs_csv: Path
    active_players_csv: Path


@dataclass
class HorizonConfig:
    forward_games: int = 5
    min_season_games_before_signal: int = 8
    require_same_season_forward: bool = True
    min_minutes_per_forward_game: float = 1.0


@dataclass
class UniverseConfig:
    active_players_only: bool = True
    seasons: list[str] = field(default_factory=list)
    min_games_per_player_season: int = 20


@dataclass
class SignalsConfig:
    include_fair_value: bool = True
    include_price_momentum: bool = True
    include_projection: bool = True
    simulate_market_layer: bool = True
    market_prev_carry_forward: bool = True


@dataclass
class PortfolioConfig:
    enabled: bool = True
    rebalance_every_games: int = 5
    top_n_holdings: int = 10
    bottom_n_short_proxy: int = 0
    initial_capital: float = 100_000.0


@dataclass
class OutputsConfig:
    run_id: str | None = None
    write_csv: bool = True
    write_markdown: bool = True
    write_plots: bool = True


@dataclass
class BacktestConfig:
    name: str = "backtest"
    data: DataConfig = field(default_factory=lambda: DataConfig(
        prices_csv=REPO_ROOT / "data" / "player_game_prices.csv",
        game_logs_csv=REPO_ROOT / "data" / "cleaned_game_logs_with_game_score.csv",
        active_players_csv=REPO_ROOT / "data" / "active_players.csv",
    ))
    horizon: HorizonConfig = field(default_factory=HorizonConfig)
    universe: UniverseConfig = field(default_factory=UniverseConfig)
    signals: SignalsConfig = field(default_factory=SignalsConfig)
    portfolio: PortfolioConfig = field(default_factory=PortfolioConfig)
    outputs: OutputsConfig = field(default_factory=OutputsConfig)
    random_seed: int = 42

    @property
    def research_root(self) -> Path:
        return Path(__file__).resolve().parent

    def output_dir(self) -> Path:
        run_id = self.outputs.run_id or _default_run_id()
        return self.research_root / "outputs" / run_id

    def reports_dir(self) -> Path:
        run_id = self.outputs.run_id or _default_run_id()
        return self.research_root / "reports" / run_id


def _default_run_id() -> str:
    from datetime import datetime, timezone

    return datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")


def _resolve_path(value: str | Path) -> Path:
    p = Path(value)
    if p.is_absolute():
        return p
    return REPO_ROOT / p


def load_config(path: Path | None = None) -> BacktestConfig:
    cfg_path = path or DEFAULT_CONFIG_PATH
    raw: dict[str, Any] = {}
    if cfg_path.is_file():
        with cfg_path.open(encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}

    data_raw = raw.get("data", {})
    data = DataConfig(
        prices_csv=_resolve_path(data_raw.get("prices_csv", "data/player_game_prices.csv")),
        game_logs_csv=_resolve_path(
            data_raw.get("game_logs_csv", "data/cleaned_game_logs_with_game_score.csv")
        ),
        active_players_csv=_resolve_path(
            data_raw.get("active_players_csv", "data/active_players.csv")
        ),
    )

    h = raw.get("horizon", {})
    horizon = HorizonConfig(
        forward_games=int(h.get("forward_games", 5)),
        min_season_games_before_signal=int(h.get("min_season_games_before_signal", 8)),
        require_same_season_forward=bool(h.get("require_same_season_forward", True)),
        min_minutes_per_forward_game=float(h.get("min_minutes_per_forward_game", 1.0)),
    )

    u = raw.get("universe", {})
    seasons = u.get("seasons") or []
    universe = UniverseConfig(
        active_players_only=bool(u.get("active_players_only", True)),
        seasons=[str(s) for s in seasons],
        min_games_per_player_season=int(u.get("min_games_per_player_season", 20)),
    )

    s = raw.get("signals", {})
    signals = SignalsConfig(
        include_fair_value=bool(s.get("include_fair_value", True)),
        include_price_momentum=bool(s.get("include_price_momentum", True)),
        include_projection=bool(s.get("include_projection", True)),
        simulate_market_layer=bool(s.get("simulate_market_layer", True)),
        market_prev_carry_forward=bool(s.get("market_prev_carry_forward", True)),
    )

    p = raw.get("portfolio", {})
    portfolio = PortfolioConfig(
        enabled=bool(p.get("enabled", True)),
        rebalance_every_games=int(p.get("rebalance_every_games", 5)),
        top_n_holdings=int(p.get("top_n_holdings", 10)),
        bottom_n_short_proxy=int(p.get("bottom_n_short_proxy", 0)),
        initial_capital=float(p.get("initial_capital", 100_000.0)),
    )

    o = raw.get("outputs", {})
    outputs = OutputsConfig(
        run_id=o.get("run_id"),
        write_csv=bool(o.get("write_csv", True)),
        write_markdown=bool(o.get("write_markdown", True)),
        write_plots=bool(o.get("write_plots", True)),
    )

    return BacktestConfig(
        name=str(raw.get("name", "backtest")),
        data=data,
        horizon=horizon,
        universe=universe,
        signals=signals,
        portfolio=portfolio,
        outputs=outputs,
        random_seed=int(raw.get("random_seed", 42)),
    )
