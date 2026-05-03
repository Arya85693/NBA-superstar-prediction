"""
Match web/lib/playerTicker.ts assignPlayerTickers() for sync-time board rows.
"""

from __future__ import annotations

import unicodedata

LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def _strip_marks(s: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn"
    )


def latin_letters_only(s: str) -> str:
    return "".join(c for c in s if c.isalpha())


def name_tokens(raw: str) -> list[str]:
    n = _strip_marks(raw)
    return [
        t for t in (latin_letters_only(x) for x in n.split()) if t
    ]


def base_ticker(name: str) -> str:
    parts = name_tokens(name)
    if not parts:
        return "PLRX"
    last = parts[-1].upper()
    if len(parts) == 1:
        return (last[:4].ljust(4, "X"))[:4]
    first = parts[0].upper()
    c0 = first[0] if first else "X"
    last3 = last[:3]
    return (c0 + last3)[:4]


def assign_player_tickers(
    rows: list[dict[str, object]],
) -> dict[int, str]:
    """rows: {player_id: int, player_name: str} — same ordering rules as TS."""
    sorted_rows = sorted(rows, key=lambda r: int(r["player_id"]))
    result: dict[int, str] = {}
    used: set[str] = set()

    for r in sorted_rows:
        pid = int(r["player_id"])
        name = str(r.get("player_name") or "")
        base = base_ticker(name)
        padded = (base[:4] if len(base) >= 4 else base.ljust(4, "X"))[:4]
        candidate = padded[:4]

        if candidate not in used:
            used.add(candidate)
            result[pid] = candidate
            continue

        i = 0
        while True:
            rot = LETTERS[(pid + i) % 26]
            candidate = (base[:3] + rot)[:4]
            if candidate not in used:
                used.add(candidate)
                result[pid] = candidate
                break
            i += 1
            if i > 52:
                candidate = f"P{pid % 1000:03d}"[:4]
                if candidate not in used:
                    used.add(candidate)
                    result[pid] = candidate
                break

    return result
