"""Position-specific prime ages and age signals."""
from datetime import date

from player_aging import (
    PEAK_AGE_BY_GROUP,
    PlayerProfile,
    age_signal,
    age_years_on,
    normalize_position_group,
    peak_age_for_group,
    profile_age_on,
)


def test_mdpi_peak_ages_by_group():
    assert PEAK_AGE_BY_GROUP["G"] == 29.5
    assert PEAK_AGE_BY_GROUP["F"] == 27.5
    assert PEAK_AGE_BY_GROUP["C"] == 25.5


def test_normalize_nba_positions():
    assert normalize_position_group("Point Guard") == "G"
    assert normalize_position_group("Forward-Center") == "F"
    assert normalize_position_group("Center") == "C"
    assert normalize_position_group("G-F") == "G"


def test_young_center_more_upside_than_prime_guard():
    young_c = age_signal(22.0, "C")
    prime_g = age_signal(29.5, "G")
    assert young_c > prime_g
    assert prime_g == 0.0


def test_wemby_vs_shai_style_curve():
    """22yo big vs ~27yo guard: youngster should carry more growth premium."""
    wemby_age = age_signal(22.0, "C")
    shai_age = age_signal(27.0, "G")
    assert wemby_age > shai_age > 0.0


def test_past_prime_is_negative():
    assert age_signal(34.0, "G") < 0.0


def test_profile_age_on():
    prof = PlayerProfile(
        player_id=1,
        birth_date=date(2004, 1, 4),
        position_group="C",
        position_raw="Center",
    )
    age = profile_age_on(prof, date(2026, 6, 4))
    assert age is not None
    assert 22.0 <= age <= 23.0


def test_age_years_on_respects_birthday():
    bday = date(1998, 7, 12)
    before = age_years_on(bday, date(2026, 7, 11))
    on = age_years_on(bday, date(2026, 7, 12))
    assert before < 28.0 <= on
