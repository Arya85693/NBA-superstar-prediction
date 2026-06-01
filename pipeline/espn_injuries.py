"""
ESPN injury feed -> per-player injury severity for the sentiment lever.

Source: ESPN's public (undocumented) NBA injuries endpoint. Free, no API key.
It is unofficial, so this module is built to FAIL SAFE: any network error,
shape change or empty response returns ``{}`` and the sentiment lever simply
stays neutral (Market Price falls back to Fair Value + the other levers). An
ESPN hiccup can never break the pipeline — it just goes quiet.

Players are matched by normalised display name (ESPN uses its own athlete ids,
not BALLDONTLIE ids), so normalisation must match the names in
``player_game_prices.csv``.
"""
from __future__ import annotations

import json
import re
import unicodedata
import urllib.request

ESPN_INJURIES_URL = (
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
)

# How much each status counts as a negative sentiment signal, in [0, 1].
# 1.0 = maximally bearish (ruled out long-term); 0.0 = no effect.
STATUS_SEVERITY: dict[str, float] = {
    "out for season": 1.0,
    "out": 0.8,
    "doubtful": 0.6,
    "suspension": 0.6,
    "questionable": 0.35,
    "game time decision": 0.35,
    "day-to-day": 0.25,
}


def normalize_name(name: str) -> str:
    """Lowercase, strip accents/punctuation/suffixes so names match across feeds."""
    s = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore").decode()
    s = s.lower()
    s = re.sub(r"\b(jr|sr|ii|iii|iv|v)\b", " ", s)
    s = re.sub(r"[^a-z ]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def severity_from_status(status: str | None) -> float:
    if not status:
        return 0.0
    return STATUS_SEVERITY.get(str(status).strip().lower(), 0.0)


def fetch_injuries(timeout: float = 20.0) -> dict[str, dict]:
    """
    Returns ``{normalized_name: {"status": str, "severity": float}}``.

    Never raises: on any failure returns ``{}`` so callers stay neutral.
    """
    try:
        req = urllib.request.Request(
            ESPN_INJURIES_URL,
            headers={"User-Agent": "Mozilla/5.0 (hoops-stock-market pipeline)"},
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            payload = json.loads(resp.read())
    except Exception:  # noqa: BLE001 - unofficial feed; degrade gracefully
        return {}

    out: dict[str, dict] = {}
    for team in payload.get("injuries") or []:
        for item in team.get("injuries") or []:
            athlete = item.get("athlete") or {}
            name = athlete.get("displayName") or (
                f"{athlete.get('firstName', '')} {athlete.get('lastName', '')}".strip()
            )
            key = normalize_name(name)
            if not key:
                continue
            status = item.get("status")
            severity = severity_from_status(status)
            if severity <= 0.0:
                continue
            # Keep the most severe status if a player appears more than once.
            prev = out.get(key)
            if prev is None or severity > prev["severity"]:
                out[key] = {"status": status, "severity": severity}
    return out


if __name__ == "__main__":  # quick manual probe
    data = fetch_injuries()
    print(f"fetched {len(data)} injured players")
    for k, v in list(data.items())[:10]:
        print(f"  {k}: {v['status']} ({v['severity']})")
