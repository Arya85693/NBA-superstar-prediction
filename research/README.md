# Hoops Stock Market — Research & Backtesting Framework

Isolated validation layer for the pricing and market systems. **Does not modify** production `price_engine.py`, `market_engine.py`, pipeline schedules, Supabase writes, or the Next.js UI.

## Purpose

Transform Hoops Stock Market from a pricing simulator into an **evidence-backed** sports analytics platform by answering:

| Research question | Analysis |
|-------------------|----------|
| Do higher-priced players perform better in future games? | Spearman(price, forward mean GmSc) |
| Do price increases predict improvement? | Spearman(momentum, forward ΔGmSc) |
| Does the model identify breakout players? | Top riser analysis |
| Does it flag future underperformers? | Biggest miss + overvalued tables |
| Would following signals beat baselines? | Rank correlation + portfolio proxy |
| Which pricing components are most predictive? | Component attribution |

## Directory layout

```
research/
  README.md                 # This file
  run_backtest.py           # CLI entry point
  config.py                 # BacktestConfig loader
  config/default.yaml       # Default settings
  data_loader.py            # CSV / price_engine panel load
  signals.py                # Point-in-time signals (imports pipeline read-only)
  baselines.py              # Comparison rankers
  backtests/
    runner.py               # Historical backtest orchestrator
    portfolio.py            # Long-only portfolio proxy
  analysis/
    metrics.py              # Spearman, quintiles, risers/misses, valuation
    reporting.py            # Markdown report generator
    visualize.py            # PNG charts (optional)
  outputs/                  # CSV + JSON per run (gitignored)
  reports/                  # BACKTEST_REPORT.md per run (gitignored)
  requirements.txt          # scipy, matplotlib, PyYAML
```

## Methodology

### 1. Data panel

- **Primary:** `data/player_game_prices.csv` (Fair Value per game, from `pipeline/price_engine.py`).
- **Fallback:** `data/cleaned_game_logs_with_game_score.csv` → recompute prices in-process (still read-only import of `price_engine`).

### 2. Point-in-time discipline

For each player-game row at date **T**:

- **Signals** use only games with `game_date ≤ T` (season-to-date projection via `projection_engine.compute_projection`, Fair Value from CSV, optional simulated Market Price via `market_engine.compute_market_price` with projection-only levers).
- **Forward label** uses the next **H** games (default H=5, same season): mean Hollinger **game score**, and **ΔGmSc** vs season-to-date average at T.

No lookahead on prices, stats, or labels.

### 3. Evaluation metrics

- **Spearman ρ** — cross-sectional rank correlation each league date, then mean/median across dates.
- **Direction accuracy** — % of observations where `sign(signal) == sign(forward Δ)`.
- **Quintile spread** — mean forward Δ in top vs bottom signal quintile.
- **Top risers / biggest misses** — extreme signal vs forward outcome cases.
- **Undervalued / overvalued** — low/high price tier vs forward performance.

### 4. Baselines

| Baseline | Definition |
|----------|------------|
| `prior_season_anchor` | Prior-season mean game score |
| `season_to_date_gs` | Expanding season average at T |
| `recent_5_game_gs` | Rolling 5-game average |
| `fair_value_level` | Fair Value price at T |
| `price_momentum` | Game-over-game % price change |
| `projection_engine` | Production projection score |
| `simulated_market` | Research replay of Market Price (projection lever only) |
| `random_control` | Seeded uniform noise |

### 5. Portfolio simulation

Long-only, equal-weight top **N** players by signal each rebalance window (default every 5 league dates). P&L is a **research proxy** tied to forward ΔGmSc — not the production paper-trading P&L engine.

### 6. Assumptions

- Universe matches pipeline: **All-Star+** sample (BALLDONTLIE), not full NBA.
- Historical backtest sets **sentiment, team context, and demand to neutral** unless you extend the framework with archived feeds.
- Market replay uses production math but **cannot** reconstruct historical intraday news or trade flow.

### 7. Limitations

- In-sample correlations may overstate live edge.
- Short forward windows are noisy; long windows reduce sample size.
- Price and game score are **correlated by construction** (Fair Value is smoothed game score) — attribution separates **projection / momentum** from level.
- CI does not run this job; research is local or a separate workflow.

## How to run

From repository root:

```bash
# 1. Python deps (root pipeline + research)
pip install -r requirements.txt -r research/requirements.txt

# 2. Build Fair Value history (if data/ CSVs missing)
python pipeline/run_pipeline.py --fetch-balldontlie --active

# 3. Run backtest (default config)
python research/run_backtest.py

# 4. Custom config
python research/run_backtest.py --config research/config/default.yaml
```

### Outputs per run

Under `research/outputs/<run_id>/`:

| File | Contents |
|------|----------|
| `evaluation_panel.csv` | Full labeled panel |
| `signal_evaluation_summary.csv` | Spearman, quintiles, direction accuracy |
| `component_attribution.csv` | Sub-lever correlations |
| `top_risers.csv` | High signal + strong forward |
| `biggest_misses.csv` | High signal + weak forward |
| `undervalued_players.csv` | Low price + strong forward |
| `overvalued_players.csv` | High price + weak forward |
| `portfolio_simulation_summary.csv` | Strategy comparison |
| `run_metadata.json` | Run config snapshot |
| `plots/*.png` | Visualizations (if matplotlib available) |

Report: `research/reports/<run_id>/BACKTEST_REPORT.md`

### Tests

```bash
pytest tests/test_research_backtest.py -q
```

Uses synthetic logs — no API key required.

## Configuration

Edit `research/config/default.yaml`:

- `horizon.forward_games` — prediction window
- `horizon.min_season_games_before_signal` — burn-in per season
- `universe.seasons` — restrict seasons (empty = all)
- `signals.simulate_market_layer` — toggle Layer 2 replay
- `portfolio.top_n_holdings` — portfolio size

## Relationship to production

| Component | Research behavior |
|-----------|-------------------|
| `pipeline/price_engine.py` | Import only; optional recompute from logs |
| `pipeline/market_engine.py` | Import only; simulated path in `signals.py` |
| `pipeline/update_market_state.py` | **Not called** |
| Supabase | **Not written** |
| `web/` | **Not modified** |

## Interpreting results

- **Spearman ρ > 0.10** sustained across signals/dates → weak but non-trivial ranking edge.
- **Projection > fair value level** for forward Δ → momentum/form lever adds information beyond price level.
- **Quintile spread** near zero → signal does not separate future performance in the cross-section.
- Compare **`simulated_market`** vs **`projection_engine`** to see if mean-reversion/caps help or hurt predictive ranking.

Always read the generated `BACKTEST_REPORT.md` for run-specific numbers and honest caveats.
