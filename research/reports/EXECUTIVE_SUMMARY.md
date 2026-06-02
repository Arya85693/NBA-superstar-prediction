# Hoops Stock Market — Research Executive Summary

**Run ID:** `full_historical_2018_2026`  
**Generated:** 2026-06-02  
**Scope:** Largest backtest supported by repository data — active All-Star+ universe, 8 NBA seasons (2018–19 through 2025–26), 104,396 evaluable player-games, 5-game forward horizon.

**Artifacts:**  
- Full report: [`reports/full_historical_2018_2026/BACKTEST_REPORT.md`](full_historical_2018_2026/BACKTEST_REPORT.md)  
- CSVs & charts: [`outputs/full_historical_2018_2026/`](../outputs/full_historical_2018_2026/)

---

## Bottom line (30 seconds)

The **projection engine** (especially **minutes trend** and **recent form** sub-levers) shows **statistically significant, economically meaningful** ability to rank which players will **improve vs their season average** over the next 5 games. **Fair Value price level** and the **simulated Market layer** (projection-only replay) do **not** improve forward-improvement prediction — they exhibit **mean-reversion** (high price → lower forward Δ). **Fair Value strongly predicts forward absolute game score** (ρ ≈ 0.81), which is expected because price is a smoothed function of past performance.

**Confidence:** High for projection sub-signals and baseline comparisons; **moderate** for portfolio proxy returns; **low** for claiming live trading edge without out-of-sample and full-market validation.

---

## 1. Does the model demonstrate predictive value?

**Yes — for the projection layer on the task “who improves next?”**  
**No — for using headline Market Price or Fair Value alone on that same task.**

| Question | Answer | Key metric | Confidence |
|----------|--------|------------|------------|
| Can the system rank future **improvement** (ΔGmSc)? | **Partially yes** | Projection ρ = **0.083**; minutes trend ρ = **0.132** | **High** (p ≪ 0.001, 1,101 eval days) |
| Can headline **Fair Value** rank improvement? | **No (inverse)** | Fair Value ρ = **−0.054** | **High** |
| Can **simulated Market** rank improvement? | **No (inverse)** | Market ρ = **−0.054** | **High** |
| Do **higher-priced** players score more next (absolute)? | **Yes** | Spearman(price, forward mean GmSc) = **0.810** | **High** — largely **level persistence**, not alpha |
| Does **price momentum** predict improvement? | **Weak yes** | Momentum ρ = **0.037** (p ≈ 1e−19) | **Medium** |

**Supporting evidence:** 104,396 point-in-time observations; cross-sectional Spearman computed per league date then averaged; one-sample t-tests reject ρ = 0 for projection components (see `statistical_tests.json`).

**Intellectual honesty:** Direction accuracy for projection is only **53.5%** — better than fair value for *ranking* improvement, but not a high hit-rate classifier. COVID-shortened 2019–20 and 2020–21 seasons show **weaker** projection signal (ρ ≈ 0.02–0.03).

---

## 2. Which components perform best?

| Rank | Component | Mean Spearman ρ (forward Δ) | Quintile spread (ΔGmSc) |
|------|-----------|----------------------------|-------------------------|
| 1 | `signal_proj_minutes_trend` | **0.132** | **+1.31** |
| 2 | `signal_proj_recent_trend` | **0.117** | **+1.11** |
| 3 | `signal_projection` (composite) | **0.083** | **+0.77** |
| 4 | `signal_price_momentum_pct` | **0.037** | **+0.39** |

**Interpretation:** Short-horizon **usage/minutes trajectory** and **recent scoring trend** drive almost all measurable predictive content. Long-form season anchor (`signal_proj_long_form`) is **negative** (ρ = −0.038) — high long-term form at T predicts **less** relative improvement (regression to the mean).

**Confidence:** **High** — consistent across component attribution CSV and daily t-tests.

---

## 3. Which components perform worst?

| Component | Mean ρ | Quintile spread | Issue |
|-----------|--------|-----------------|-------|
| `_season_avg_gs_at_t` (naive baseline) | **−0.102** | −1.11 | Penalizes hot players |
| `signal_fair_value` | **−0.054** | −0.64 | Price level ≠ momentum |
| `signal_simulated_market` | **−0.054** | −0.63 | Tracks fair value closely |
| `signal_premium_pct` | **−0.007** | −0.11 | Market premium adds no Δ signal |
| `_random_baseline` | **~0** | ~0.01 | As expected |

**Confidence:** **High**.

---

## 4. Does the projection engine outperform simple baselines?

**Yes**, on forward **improvement** (ΔGmSc vs season-to-date average):

| Signal | Spearman ρ | Beats random? |
|--------|------------|---------------|
| Minutes trend | 0.132 | Yes (p ≪ 0.001) |
| Projection composite | 0.083 | Yes (p ≈ 2e−53) |
| Price momentum | 0.037 | Yes (p ≈ 1e−19) |
| Prior season anchor | −0.022 | No |
| Recent 5-game average | −0.030 | No |
| Season-to-date average | −0.102 | No (worst) |
| Fair value level | −0.054 | No |
| Random | ~0 | — |

**Paired test (1,101 days):** projection vs fair value mean ρ difference = **+0.137**, t = **22.7**, p ≈ **10⁻94**.

**Portfolio proxy (218 rebalances, long top-10 by signal):**

| Strategy | Total return % | vs random (32.4%) |
|----------|----------------|-------------------|
| Minutes trend | **109.4%** | +77 pp |
| Projection | **71.0%** | +38.6 pp |
| Fair value | 15.1% | −17.3 pp |
| Simulated market | 13.0% | −19.4 pp |

**Caveat:** Portfolio figures are a **research P&L proxy** (GmSc-linked), not production paper-trading. Returns are **not** risk-adjusted and are **in-sample**.

**Confidence:** **High** for rank metrics; **Medium** for portfolio magnitudes.

---

## 5. Does Fair Value contain predictive information?

**Two different answers depending on the target:**

| Target | Fair Value useful? | Metric |
|--------|-------------------|--------|
| **Forward mean game score** (absolute level) | **Yes — very strong** | ρ = **0.810** (n = 104,396) |
| **Forward improvement** (Δ vs season avg) | **No — harmful for ranking** | ρ = **−0.054**, quintile spread **−0.64** |

Fair Value is built from smoothed historical game score; it **correctly identifies who is good** but **overstates who will get even better** in the next 5 games. Undervalued findings (Cam Thomas 2023, Michael Porter Jr. 2020) are cases where **low price met a breakout** — often **role/minutes expansion** not captured at prior price.

**Confidence:** **High** for both statements; the 0.81 correlation is partly **construct overlap**, not independent discovery.

---

## 6. Does the Market layer add predictive information?

**Not in this historical replay** (projection-only levers; sentiment/team/demand neutral).

| Comparison | Result |
|------------|--------|
| Market vs projection (ρ) | Market **−0.054** vs projection **+0.083** |
| Market vs fair value | Nearly identical (premium ρ ≈ −0.007) |
| Portfolio return | Market **13.0%** vs projection **71.0%** |

With neutral non-projection levers, simulated Market Price **does not add** forward-Δ information; it **inherits** fair-value mean-reversion. Live sentiment/demand **were not backtested**.

**Confidence:** **High** for this replay configuration; **Low** for claiming the live Market layer never helps (untested levers).

---

## 7. Statistical evidence summary

| Test | Result |
|------|--------|
| H₀: mean daily ρ (projection) = 0 | **Rejected** (t = 16.25, p ≈ 2e−53) |
| H₀: mean daily ρ (random) = 0 | **Not rejected** (p = 0.95) |
| Projection vs fair value (paired) | **Projection higher** (p ≈ 10⁻94) |
| Top vs bottom projection decile | Mean Δ = **+1.48** vs **−0.05** (spread **1.52** GmSc) |
| P(Δ>0 \| proj>0) vs P(Δ>0 \| proj<0) | **57.8%** vs **52.0%** |

Effect sizes are **small-to-moderate** in correlation terms (ρ ~ 0.08–0.13) but **stable across 1,100+ evaluation days** and **material in quintile spreads** (~0.8–1.3 GmSc).

---

## 8. Major limitations

1. **Universe:** 525 active All-Star+ players (BALLDONTLIE sample), not full NBA — survivorship and star bias.  
2. **In-sample:** No walk-forward holdout; metrics may be optimistic.  
3. **Market replay incomplete:** No historical sentiment, trades, or demand.  
4. **Label noise:** 5-game forward window is volatile; direction accuracy ~53–55%.  
5. **Price–performance tautology:** Level correlations conflate smoothing with prediction.  
6. **Portfolio proxy:** Not transaction costs, slippage, or real HSM P&L.  
7. **Season heterogeneity:** 2019–20 / 2020–21 projection ρ ≈ 0.02 — regime risk.  
8. **Injuries / load management:** Not modeled; drives many “biggest misses” (Embiid, Haliburton, Reaves).

---

## 9. Notable case studies (from CSVs)

**Top successes (high market signal + strong forward Δ):** Damian Lillard (Jan 2020 streak), Luka Dončić (Dec 2022), Kyrie Irving (Feb 2022), Kawhi Leonard (Dec 2025).

**Biggest failures (high signal + collapse):** Austin Reaves (Dec 2025, Δ = −16.0), Anthony Davis (Feb 2019), Joel Embiid (Jan 2024), Tyrese Haliburton (Dec 2023) — injury/availability patterns.

**Undervalued (low price + surge):** Cam Thomas (Jan–Feb 2023), Michael Porter Jr. (Aug 2020 bubble), Brandon Williams (Feb 2025).

**Overvalued (high price + slump):** Overlaps heavily with misses — stars priced for MVP form before injury or cold stretch.

---

## 10. What you can legitimately claim on a resume

**Defensible:**

- Built and ran a **point-in-time backtesting framework** over **104K+ player-game observations** across **8 seasons** validating an NBA player “stock market” pricing stack.  
- Demonstrated that a **production projection engine** significantly **outperforms naive baselines** (season average, fair value, random) for ranking **short-horizon performance improvement** (Spearman ρ ≈ 0.08–0.13, p ≪ 0.001).  
- Quantified **component attribution** showing **minutes and recent-trend levers** as primary drivers of predictive signal.  
- Documented **limitations** (sample universe, in-sample, partial market replay) with reproducible CSV/Markdown/chart outputs.

**Avoid overstating:**

- Do **not** claim “beat the market” or guaranteed alpha — portfolio results are a proxy and in-sample.  
- Do **not** claim full NBA coverage or live sentiment validation.  
- Do **not** equate ρ = 0.81 price–forward-level with “prediction” without noting smoothing/level effects.

---

## 11. Research that would most improve credibility

1. **Walk-forward / holdout:** Train thresholds on seasons 1–6, report only on 7–8.  
2. **Full NBA universe** beyond All-Star+ sample.  
3. **Historical sentiment proxy** (injury reports, minutes restrictions) for Market layer.  
4. **Multiple horizons** (3, 10, 20 games) with Bonferroni correction.  
5. **Bootstrap confidence intervals** on quintile spreads and portfolio Sharpe.  
6. **Comparison to Vegas prop lines** or EPM/RAPTOR as external benchmarks.  
7. **Paper-trading reconciliation** against production P&L engine.

---

## Artifact index

### Reports
| File | Description |
|------|-------------|
| `research/reports/EXECUTIVE_SUMMARY.md` | This document |
| `research/reports/full_historical_2018_2026/BACKTEST_REPORT.md` | Detailed methodology + tables |

### CSVs (`research/outputs/full_historical_2018_2026/`)
| File | Description |
|------|-------------|
| `evaluation_panel.csv` | Full labeled panel (131,908 rows) |
| `signal_evaluation_summary.csv` | Spearman, quintiles, direction accuracy |
| `component_attribution.csv` | Sub-lever breakdown |
| `top_risers.csv` | Breakout hits |
| `biggest_misses.csv` | False positives |
| `undervalued_players.csv` | Low price + strong forward |
| `overvalued_players.csv` | High price + weak forward |
| `portfolio_simulation_summary.csv` | Strategy comparison |
| `run_metadata.json` | Run config snapshot |
| `statistical_tests.json` | Supplemental hypothesis tests |

### Charts (`research/outputs/full_historical_2018_2026/plots/`)
| File | Description |
|------|-------------|
| `spearman_by_signal.png` | Signal ranking power |
| `quintile_spread_by_signal.png` | Economic spread by quintile |
| `projection_vs_fairvalue_by_season.png` | Season stability |
| `price_vs_forward_scatter.png` | Level persistence |
| `projection_vs_forward_delta.png` | Projection vs improvement |

---

*Reproduce: `python research/run_backtest.py --config research/config/full_historical_run.yaml`*
