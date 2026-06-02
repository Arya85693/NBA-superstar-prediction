# Hoops Stock Market — Historical Backtest Report

**Generated:** 2026-06-02 17:18 UTC  
**Config:** `full_historical_backtest_2018_2026`  
**Forward horizon:** 5 games  
**Evaluable observations:** 104396

## Executive summary

The primary model signal (`signal_simulated_market`) shows **weak** cross-sectional rank correlation with forward game-score improvement (mean Spearman ρ = -0.0542). Top-vs-bottom quintile forward ΔGmSc spread: **-0.63** points.

### Research questions (price level)

| Question | Metric | Value |
|----------|--------|-------|
| Do higher-priced players score better in the next 5 games? | Spearman(price, forward mean GmSc) | 0.8099 |
| Do price increases predict improvement? | Spearman(momentum, forward ΔGmSc) | 0.0440 |

## Data provenance

| Field | Value |
|-------|-------|
| source | data\player_game_prices.csv |
| built_from | player_game_prices.csv |
| rows | 134078 |
| players | 525 |
| date_min | 2018-10-16 |
| date_max | 2026-04-12 |
| seasons | 2018-19, 2019-20, 2020-21, 2021-22, 2022-23, 2023-24, 2024-25, 2025-26 |

## Signal & baseline comparison

| signal_name | n_observations | spearman_mean | spearman_median | direction_accuracy_pct | quintile_spread |
|---|---|---|---|---|---|
| signal_proj_minutes_trend | 104396 | 0.1323 | 0.1386 | 54.8 | 1.31 |
| signal_proj_recent_trend | 104396 | 0.1174 | 0.1185 | 54.7 | 1.11 |
| signal_projection | 104396 | 0.0831 | 0.0973 | 53.5 | 0.77 |
| signal_price_momentum_pct | 104396 | 0.0367 | 0.0413 | 50.6 | 0.39 |
| _random_baseline | 104396 | 0.0002 | 0.0003 | 55.8 | 0.01 |
| signal_premium_pct | 104396 | -0.0066 | -0.0103 | 50.7 | -0.11 |
| prior_season_avg_game_score | 104396 | -0.0219 | -0.0193 | 55.0 | -0.27 |
| _recent_5_gs_at_t | 104396 | -0.0301 | -0.0274 | 55.7 | -0.41 |
| signal_proj_long_form | 104396 | -0.0375 | -0.0272 | 49.1 | -0.39 |
| signal_fair_value | 104396 | -0.0537 | -0.0530 | 55.8 | -0.64 |
| signal_simulated_market | 104396 | -0.0542 | -0.0519 | 55.8 | -0.63 |
| _season_avg_gs_at_t | 104396 | -0.1023 | -0.1030 | 55.8 | -1.11 |

## Component attribution (pricing system)

- **signal_proj_minutes_trend**: ρ=0.1323, quintile spread=1.31
- **signal_proj_recent_trend**: ρ=0.1174, quintile spread=1.11
- **signal_projection**: ρ=0.0831, quintile spread=0.77
- **signal_price_momentum_pct**: ρ=0.0367, quintile spread=0.39
- **signal_premium_pct**: ρ=-0.0066, quintile spread=-0.11
- **signal_proj_long_form**: ρ=-0.0375, quintile spread=-0.39
- **signal_fair_value**: ρ=-0.0537, quintile spread=-0.64

## Portfolio simulation (long-only proxy)

| Strategy | Rebalances | Total return % | Avg period forward Δ |
|----------|------------|----------------|----------------------|
| signal_proj_minutes_trend | 218 | 109.41% | 1.70 |
| signal_proj_recent_trend | 218 | 76.57% | 1.31 |
| signal_projection | 218 | 70.99% | 1.23 |
| signal_price_momentum_pct | 218 | 59.23% | 1.07 |
| signal_premium_pct | 218 | 34.82% | 0.69 |
| _random_baseline | 218 | 32.36% | 0.64 |
| prior_season_avg_game_score | 218 | 23.48% | 0.49 |
| signal_proj_long_form | 218 | 23.24% | 0.48 |
| signal_fair_value | 218 | 15.12% | 0.32 |
| _recent_5_gs_at_t | 218 | 13.26% | 0.29 |
| signal_simulated_market | 218 | 12.96% | 0.28 |
| _season_avg_gs_at_t | 218 | 3.75% | 0.09 |

## Top risers (model called breakout)

| game_date | player_id | player_name | team_abbr | season | signal_simulated_market | signal_fair_value | forward_delta_game_score | forward_mean_game_score |
|---|---|---|---|---|---|---|---|---|
| 2020-01-18 00:00:00 | 203081 | Damian Lillard | POR | 2019-20 | 137.3409121472995 | 137.51959210462798 | 20.22714285714286 | 41.42 |
| 2020-01-20 00:00:00 | 203081 | Damian Lillard | POR | 2019-20 | 140.04447224651318 | 140.77805379720132 | 18.85441860465117 | 40.68000000000001 |
| 2022-12-21 00:00:00 | 1629029 | Luka Dončić | DAL | 2022-23 | 146.154889146439 | 145.94742042485964 | 15.802758620689659 | 41.92 |
| 2020-01-17 00:00:00 | 203081 | Damian Lillard | POR | 2019-20 | 136.8653053999655 | 137.86573396144354 | 15.624878048780495 | 36.82000000000001 |
| 2020-01-15 00:00:00 | 203081 | Damian Lillard | POR | 2019-20 | 136.23438478021043 | 136.2365396458008 | 15.34 | 36.42 |
| 2025-12-20 00:00:00 | 202695 | Kawhi Leonard | LAC | 2025-26 | 126.32551339703957 | 127.59764987173249 | 15.127777777777776 | 35.0 |
| 2022-02-26 00:00:00 | 202681 | Kyrie Irving | BKN | 2021-22 | 128.35907084199664 | 127.3176147223121 | 14.740000000000002 | 32.660000000000004 |
| 2022-02-12 00:00:00 | 202681 | Kyrie Irving | BKN | 2021-22 | 128.5618380560674 | 129.9830481498643 | 14.677142857142858 | 31.82 |
| 2020-01-11 00:00:00 | 201566 | Russell Westbrook | HOU | 2019-20 | 123.73681295670356 | 123.84261925054814 | 14.553939393939395 | 30.96 |
| 2019-03-21 00:00:00 | 1626164 | Devin Booker | PHX | 2018-19 | 128.98830319668824 | 125.06519546487628 | 14.511379310344829 | 31.52 |
| 2020-01-23 00:00:00 | 203081 | Damian Lillard | POR | 2019-20 | 143.046386969815 | 143.3375859560091 | 14.344999999999995 | 36.519999999999996 |
| 2024-11-11 00:00:00 | 1628368 | De'Aaron Fox | SAC | 2024-25 | 128.2975175738263 | 126.61058466814362 | 14.23272727272727 | 30.859999999999996 |
| 2022-03-06 00:00:00 | 202681 | Kyrie Irving | BKN | 2021-22 | 128.33446155584312 | 126.79939384954189 | 14.232499999999998 | 31.919999999999998 |
| 2025-12-18 00:00:00 | 202695 | Kawhi Leonard | LAC | 2025-26 | 124.84568749209362 | 124.19674210097835 | 14.152941176470588 | 33.6 |
| 2019-03-18 00:00:00 | 1626164 | Devin Booker | PHX | 2018-19 | 130.21467137934727 | 127.5839548617443 | 14.057192982456144 | 31.080000000000002 |

## Biggest misses (high signal, poor forward)

| game_date | player_id | player_name | team_abbr | season | signal_simulated_market | signal_fair_value | forward_delta_game_score |
|---|---|---|---|---|---|---|---|
| 2025-12-05 00:00:00 | 1630559 | Austin Reaves | LAL | 2025-26 | 140.12542976733184 | 138.90799165355395 | -16.0421052631579 |
| 2019-02-08 00:00:00 | 203076 | Anthony Davis | NOP | 2018-19 | 151.2135329735307 | 126.833838065929 | -15.164761904761907 |
| 2019-02-09 00:00:00 | 203076 | Anthony Davis | NOP | 2018-19 | 144.23157098302804 | 130.89693731751714 | -15.157674418604651 |
| 2024-01-22 00:00:00 | 203954 | Joel Embiid | PHI | 2023-24 | 164.834611098755 | 164.26004581389788 | -14.920000000000002 |
| 2022-12-02 00:00:00 | 1626164 | Devin Booker | PHX | 2022-23 | 137.8535808082762 | 139.57875818337143 | -14.826363636363633 |
| 2024-02-27 00:00:00 | 1628378 | Donovan Mitchell | CLE | 2023-24 | 137.80300989257057 | 134.3062779244976 | -13.723478260869566 |
| 2019-11-12 00:00:00 | 203081 | Damian Lillard | POR | 2019-20 | 150.94425438375765 | 147.9650989514288 | -13.16545454545454 |
| 2023-12-07 00:00:00 | 1630169 | Tyrese Haliburton | IND | 2023-24 | 153.19466085470074 | 152.35762215969788 | -12.793333333333333 |
| 2024-12-15 00:00:00 | 1629029 | Luka Dončić | DAL | 2024-25 | 149.35322203374082 | 150.91963413700392 | -12.785000000000004 |
| 2023-12-11 00:00:00 | 1630169 | Tyrese Haliburton | IND | 2023-24 | 152.76000526426745 | 147.902574100319 | -12.690526315789473 |
| 2020-01-15 00:00:00 | 201935 | James Harden | HOU | 2019-20 | 153.90810371031205 | 152.6477143698653 | -12.688205128205128 |
| 2023-12-29 00:00:00 | 1628368 | De'Aaron Fox | SAC | 2023-24 | 138.91761605113916 | 140.66007537557692 | -12.657500000000002 |
| 2019-01-18 00:00:00 | 203076 | Anthony Davis | NOP | 2018-19 | 163.75839260598602 | 159.56866133285737 | -12.63609756097561 |
| 2020-01-14 00:00:00 | 201935 | James Harden | HOU | 2019-20 | 157.0484566776709 | 156.34874342435643 | -12.61105263157895 |
| 2024-01-02 00:00:00 | 1628368 | De'Aaron Fox | SAC | 2023-24 | 138.60515811550556 | 136.6603611055088 | -12.486153846153847 |

## Undervalued (low price, strong forward)

| game_date | player_id | player_name | team_abbr | signal_fair_value | forward_delta_game_score | signal_projection |
|---|---|---|---|---|---|---|
| 2023-01-28 00:00:00 | 1630560 | Cam Thomas | BKN | 71.55675833353888 | 20.602500000000003 | -0.09882337644925994 |
| 2023-01-30 00:00:00 | 1630560 | Cam Thomas | BKN | 73.66379095607786 | 19.47878787878788 | -0.06760409529624892 |
| 2023-02-01 00:00:00 | 1630560 | Cam Thomas | BKN | 75.29894630653945 | 18.59235294117648 | 0.05920735984182482 |
| 2020-08-01 00:00:00 | 1629008 | Michael Porter Jr. | DEN | 70.51412896080534 | 16.78244897959184 | -0.28921978351602556 |
| 2025-02-23 00:00:00 | 1630314 | Brandon Williams | DAL | 65.16994417377448 | 16.414999999999996 | 0.39201152844448994 |
| 2022-03-30 00:00:00 | 1630167 | Obi Toppin | NYK | 75.3032037862828 | 16.096417910447762 | 0.6737254910128646 |
| 2020-03-11 00:00:00 | 1629008 | Michael Porter Jr. | DEN | 71.16416110811028 | 15.150833333333338 | -0.22577599381626273 |
| 2025-03-05 00:00:00 | 1630314 | Brandon Williams | DAL | 68.23596109124276 | 15.13238095238095 | 0.5377763638336435 |
| 2024-11-10 00:00:00 | 1642261 | Dalton Knecht | LAL | 66.55425179782239 | 15.120000000000001 | -0.08279670784911461 |
| 2023-01-26 00:00:00 | 1630560 | Cam Thomas | BKN | 71.73160630315289 | 15.064516129032258 | -0.05856086492156695 |

## Overvalued (high price, weak forward)

| game_date | player_id | player_name | team_abbr | signal_fair_value | forward_delta_game_score | signal_projection |
|---|---|---|---|---|---|---|
| 2025-12-05 00:00:00 | 1630559 | Austin Reaves | LAL | 138.90799165355395 | -16.0421052631579 | 0.43858926526430003 |
| 2019-02-08 00:00:00 | 203076 | Anthony Davis | NOP | 126.833838065929 | -15.164761904761907 | 0.0036673391834120134 |
| 2019-02-09 00:00:00 | 203076 | Anthony Davis | NOP | 130.89693731751714 | -15.157674418604651 | -0.027831905196282085 |
| 2024-01-22 00:00:00 | 203954 | Joel Embiid | PHI | 164.26004581389788 | -14.920000000000002 | 0.5517149531467044 |
| 2022-12-02 00:00:00 | 1626164 | Devin Booker | PHX | 139.57875818337143 | -14.826363636363633 | 0.4927877523666852 |
| 2024-02-27 00:00:00 | 1628378 | Donovan Mitchell | CLE | 134.3062779244976 | -13.723478260869566 | -0.0077072631954468 |
| 2019-11-12 00:00:00 | 203081 | Damian Lillard | POR | 147.9650989514288 | -13.16545454545454 | 0.33363403117570023 |
| 2023-12-07 00:00:00 | 1630169 | Tyrese Haliburton | IND | 152.35762215969788 | -12.793333333333333 | 0.4940037648925052 |
| 2024-12-15 00:00:00 | 1629029 | Luka Dončić | DAL | 150.91963413700392 | -12.785000000000004 | 0.187505341964794 |
| 2023-12-11 00:00:00 | 1630169 | Tyrese Haliburton | IND | 147.902574100319 | -12.690526315789473 | 0.45228962189070376 |

## Methodology notes

- Point-in-time signals: only games played **on or before** the signal date are used.
- Forward outcome: mean Hollinger game score over the next **5** games (same season), minus season-to-date average at signal time.
- Market layer replay uses production `compute_market_price` with **projection only** (sentiment, team context, demand neutral) — historical news/trades are not time-traveled.
- Portfolio simulation is a **research proxy** (GmSc-linked P&L), not the production paper-trading engine.

## Limitations

- All-Star+ universe (BALLDONTLIE sample) — not full NBA.
- No injury/news history in backtest; live sentiment lever untested historically.
- Demand lever requires user trades; backtest defaults demand to neutral.
- Correlation ≠ causation; in-sample metrics can overstate edge.
