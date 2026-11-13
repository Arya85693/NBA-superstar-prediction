"""fv_live_state must price one more game exactly like price_engine.compute_prices."""
from __future__ import annotations

import json
import random

import pandas as pd
import pytest

from fv_live_state import (
    DNP_PROGRESS_THRESHOLD,
    FvState,
    build_fv_states,
    game_progress,
    live_fair_value,
    one_step,
)
from price_engine import compute_prices


def _season_rows(pid: int, season: str, start: str, games: int, rng: random.Random,
                 mean_gs: float, dnp_every: int = 0) -> list[dict]:
    rows = []
    for i, day in enumerate(pd.date_range(start, periods=games, freq="2D")):
        dnp = dnp_every and (i + 1) % dnp_every == 0
        rows.append({
            "player_id": pid,
            "season": season,
            "game_id": f"{pid}-{season}-{i}",
            "game_date": day.strftime("%Y-%m-%d"),
            "minutes": 0.0 if dnp else round(rng.uniform(14, 40)),
            "game_score": 0.0 if dnp else round(rng.gauss(mean_gs, 6.0), 1),
        })
    return rows


def _history() -> pd.DataFrame:
    rng = random.Random(7)
    rows: list[dict] = []
    # Veteran: full prior season + current season with occasional DNPs.
    rows += _season_rows(1, "2025-26", "2025-10-21", 60, rng, 16.0)
    rows += _season_rows(1, "2026-27", "2026-10-21", 9, rng, 18.0, dnp_every=4)
    # Short prior sample (confidence < 1), early current season (alpha dampened).
    rows += _season_rows(2, "2025-26", "2026-02-01", 12, rng, 9.0)
    rows += _season_rows(2, "2026-27", "2026-10-22", 3, rng, 11.0)
    # Rookie: no prior season at all.
    rows += _season_rows(3, "2026-27", "2026-10-21", 6, rng, 7.0)
    return pd.DataFrame(rows)


def _priced(df: pd.DataFrame) -> pd.DataFrame:
    out = compute_prices(df)
    return out.sort_values(["player_id", "game_date"], kind="mergesort").reset_index(drop=True)


@pytest.mark.parametrize("pid", [1, 2, 3])
def test_one_step_matches_compute_prices(pid: int) -> None:
    hist = _history()
    rng = random.Random(pid)
    nxt = {
        "player_id": pid, "season": "2026-27", "game_id": f"{pid}-next",
        "game_date": "2026-12-30", "minutes": 33.0,
        "game_score": round(rng.uniform(-2, 38), 1),  # includes big surprises
    }
    full = _priced(pd.concat([hist, pd.DataFrame([nxt])], ignore_index=True))
    before = _priced(hist)

    state = {s.player_id: s for s in build_fv_states(before)}[pid]
    expected = float(full[full["player_id"] == pid].iloc[-1]["price_after_game"])
    assert one_step(state, nxt["game_score"], nxt["minutes"]) == pytest.approx(expected, abs=1e-9)


def test_one_step_surprise_and_dnp() -> None:
    before = _priced(_history())
    state = {s.player_id: s for s in build_fv_states(before)}[1]
    # A DNP leaves Fair Value unchanged, like compute_prices.
    assert one_step(state, 25.0, 0.0) == state.fair_value
    # Monster game moves more than an average one (surprise boost + tonight weight).
    avg = one_step(state, state.hist_mean / 1.0, 34.0)
    big = one_step(state, 45.0, 34.0)
    assert big > avg > 0


def test_state_fields() -> None:
    before = _priced(_history())
    states = {s.player_id: s for s in build_fv_states(before)}
    vet, rookie = states[1], states[3]
    assert vet.season == "2026-27"
    assert vet.prior_conf == 1.0 and vet.prior_eff is not None
    assert vet.hist_n == vet.games_in_season == 7  # 9 rows, 2 DNPs
    assert rookie.prior_eff is None and rookie.prior_conf == 0.0
    assert states[2].prior_conf == pytest.approx(12 / 25)
    json.dumps(vet.to_row())  # serialisable for Supabase


def test_game_progress() -> None:
    assert game_progress("pre", 0, 0) == 0.0
    assert game_progress("in", 1, 12 * 60) == 0.0
    assert game_progress("in", 2, 0) == pytest.approx(0.5)
    assert game_progress("in", 3, 6 * 60) == pytest.approx(30 / 48)
    assert game_progress("in", 5, 120) == 1.0
    assert game_progress("post", 4, 0) == 1.0


def test_live_fair_value_scales_with_progress() -> None:
    before = _priced(_history())
    state = {s.player_id: s for s in build_fv_states(before)}[1]

    # Final line: identical to the batch model.
    final = live_fair_value(state, 30.0, 35.0, 1.0)
    assert final.fair_value == pytest.approx(one_step(state, 30.0, 35.0))
    assert final.projected_minutes == 35.0

    # Halftime: projects the rest of the game at the season rate, half the move.
    half = live_fair_value(state, 15.0, 17.0, 0.5)
    assert half.projected_minutes == pytest.approx(17.0 + state.mean_minutes * 0.5)
    assert half.fair_value == pytest.approx(
        state.fair_value + 0.5 * (half.full_game_fair_value - state.fair_value)
    )

    # Hot first quarter moves price up, but less than the same pace at the final buzzer.
    hot_q1 = live_fair_value(state, 14.0, 9.0, 0.25)
    assert state.fair_value < hot_q1.fair_value

    # Not in the game yet: never priced.
    bench = live_fair_value(state, 0.0, 0.0, DNP_PROGRESS_THRESHOLD + 0.1)
    assert bench.fair_value == state.fair_value


def test_parity_fixture_for_typescript() -> None:
    """Golden values the TypeScript port (web/tests/liveFairValue.test.mjs) asserts."""
    before = _priced(_history())
    exact = {s.player_id: s for s in build_fv_states(before)}[2]
    # Price from the rounded row, exactly what Supabase stores and TypeScript reads.
    state = FvState(**exact.to_row())
    cases = [(22.5, 31.0, 1.0), (6.0, 10.0, 0.4), (-3.0, 20.0, 0.75)]
    values = [round(live_fair_value(state, gs, m, p).fair_value, 9) for gs, m, p in cases]
    # Printed so the TS fixture can be regenerated: pytest -s tests/test_fv_live_state.py
    print("TS_PARITY_STATE", json.dumps(state.to_row()))
    print("TS_PARITY_VALUES", json.dumps(values))
    assert all(v > 0 for v in values)
