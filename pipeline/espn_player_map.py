"""
Resolve ESPN athlete ids onto the player ids the market already uses.

Every market table (player_game_prices, player_market_state, positions, trades,
watchlists) is keyed by the existing ``PLAYER_ID`` values: NBA.com ids for most
players and BALLDONTLIE ids for some newer ones. They must never change, so an
ESPN athlete id is mapped onto one of them exactly once and the mapping is
persisted:

- Supabase table ``public.espn_player_map`` (see ``supabase/espn_player_map.sql``)
  when ``SUPABASE_URL`` and ``SUPABASE_SERVICE_ROLE_KEY`` are set, and
- a local mirror ``data/espn_player_map.csv`` (the only store when Supabase is
  not configured or unreachable).

Candidates are the existing players in the raw-log cache, the price file,
``active_players.csv`` and ``player_profiles.csv`` (birth dates). For an ESPN id
that is not mapped yet, candidates are found by (strongest first):

3. ``name`` / ``name+dob`` — same ``espn_injuries.normalize_name`` (accents,
   punctuation and Jr/Sr/II/III suffixes stripped, the same suffix merge
   ``balldontlie_fetch.canon_player_ids`` relies on).
2. ``name-variant`` — same letters ignoring spaces ("AJ" / "A.J.") or the same
   words in another order ("Yang Hansen" / "Hansen Yang");
   ``lastname+dob`` — same last name and birth date within one day;
   ``team+lastname`` — same current team, last name and first initial
   ("Ace" / "Airious Bailey"), candidate played recently.
1. ``name-prefix`` — same last name, one first name a prefix of the other
   ("Nic" / "Nicolas"); ``name-subset`` — same first name and one name's words
   contain the other's ("David Jones Garcia" / "David Jones"). Candidate must
   have played recently or have a matching birth date.

A known birth date that differs by more than one day rules a candidate out.
The strongest candidate wins (latest game breaks ties, like ``canon_player_ids``)
— except that when the strongest one has not played recently and a weaker one
has, the weaker one wins: that is the id the market currently trades (for
example BALLDONTLIE kept its own id for "Nicolas Claxton" because the name did
not match NBA.com's "Nic Claxton"). Every such choice is listed for review.

No player id is ever assigned to two ESPN ids: when two athletes claim one id the
stronger claim keeps it and the other is re-resolved without it. Players with no
candidate get ``player_id = 9_000_000_000 + int(espn_id)`` (``matched_by='new'``).

Set ``ESPN_PLAYER_MAP_SUPABASE=0`` to ignore Supabase even when it is configured.
"""
from __future__ import annotations

import csv
import os
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Iterable, NamedTuple

import pandas as pd

_PIPELINE_DIR = Path(__file__).resolve().parent
if str(_PIPELINE_DIR) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_DIR))

from espn_injuries import normalize_name  # noqa: E402

ROOT = _PIPELINE_DIR.parent
DATA_DIR = ROOT / "data"
MAP_CSV = DATA_DIR / "espn_player_map.csv"
ACTIVE_CSV = DATA_DIR / "active_players.csv"
PROFILES_CSV = DATA_DIR / "player_profiles.csv"
PRICES_CSV = DATA_DIR / "player_game_prices.csv"
TABLE = "espn_player_map"
# Well above every NBA.com (~1.6e6) and BALLDONTLIE (~1.06e9) id, so a new
# id can't collide; still far below 2**53, so it is exact in JavaScript too.
NEW_PLAYER_ID_OFFSET = 9_000_000_000
MAP_COLUMNS = ["espn_id", "player_id", "player_name", "matched_by", "created_at", "updated_at"]
DOB_TOLERANCE_DAYS = 1
# "Played recently" = a game within this many days of the newest game in the pool.
RECENT_DAYS = 120
SUPABASE_PAGE = 1000


@dataclass
class MapRow:
    espn_id: str
    player_id: int
    player_name: str = ""
    matched_by: str = ""
    created_at: str = ""
    updated_at: str = ""


@dataclass
class Candidate:
    player_id: int
    name: str
    norms: set[str] = field(default_factory=set)
    last_date: pd.Timestamp | None = None
    rows: int = 0
    birth_date: date | None = None
    team: str = ""

    def when(self) -> pd.Timestamp:
        return self.last_date if self.last_date is not None and not pd.isna(self.last_date) else pd.Timestamp.min

    def rank(self) -> tuple:
        """Higher is preferred: latest game, then most rows, then id."""
        return (self.when(), self.rows, self.player_id)


class Athlete(NamedTuple):
    espn_id: str
    name: str
    dob: object = None
    team: str = ""


@dataclass
class MapReport:
    matched: list[tuple[str, str, int, str]] = field(default_factory=list)  # espn_id, name, pid, how
    new: list[tuple[str, str, int]] = field(default_factory=list)
    review: list[str] = field(default_factory=list)


def _parse_date(raw: object) -> date | None:
    if raw is None:
        return None
    s = str(raw).strip()
    if not s or s.lower() in ("nan", "nat", "none"):
        return None
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _tokens(norm: str) -> list[str]:
    return [t for t in norm.split(" ") if t]


def _aliases(norm: str) -> set[str]:
    """Spelling-insensitive keys: letters without spaces, and words sorted."""
    toks = _tokens(norm)
    return {"".join(toks), " ".join(sorted(toks))}


def new_player_id(espn_id: str) -> int:
    return NEW_PLAYER_ID_OFFSET + int(str(espn_id).strip())


# ---------------------------------------------------------------------------
# Candidate pool (existing players)
# ---------------------------------------------------------------------------

def build_candidates(
    raw_logs: pd.DataFrame | None = None,
    active: pd.DataFrame | None = None,
    profiles: pd.DataFrame | None = None,
    prices: pd.DataFrame | None = None,
) -> list[Candidate]:
    """
    One candidate per existing player id, with every name it appeared under.

    ``raw_logs`` uses PLAYER_ID / PLAYER_NAME / GAME_DATE / TEAM_ABBREVIATION;
    ``prices`` player_id / player_name / game_date / team_abbr; ``active`` and
    ``profiles`` player_id / player_name (profiles also birth_date).
    """
    by_id: dict[int, Candidate] = {}

    def get(pid_raw: object) -> Candidate | None:
        pid = pd.to_numeric(pid_raw, errors="coerce")
        if pd.isna(pid) or int(pid) <= 0:
            return None
        pid = int(pid)
        if pid not in by_id:
            by_id[pid] = Candidate(pid, "")
        return by_id[pid]

    def add_name(cand: Candidate, name_raw: object, latest: bool) -> None:
        name = "" if name_raw is None or pd.isna(name_raw) else str(name_raw).strip()
        norm = normalize_name(name) if name else ""
        if not norm:
            return
        cand.norms.add(norm)
        if latest or not cand.name:
            cand.name = name

    def add_games(frame: pd.DataFrame | None, id_col: str, name_col: str, date_col: str, team_col: str) -> None:
        if frame is None or frame.empty or not {id_col, name_col} <= set(frame.columns):
            return
        work = pd.DataFrame(
            {
                "pid": pd.to_numeric(frame[id_col], errors="coerce"),
                "name": frame[name_col].astype(str),
                "when": pd.to_datetime(frame[date_col], errors="coerce") if date_col in frame.columns else pd.NaT,
                "team": frame[team_col].astype(str) if team_col in frame.columns else "",
            },
        ).dropna(subset=["pid"])
        work = work.sort_values("when", na_position="first")
        per_name = work.groupby(["pid", "name"], as_index=False).agg(when=("when", "max"), n=("pid", "size"))
        for pid, name, when, n in per_name.itertuples(index=False):
            cand = get(pid)
            if cand is None:
                continue
            cand.rows += int(n)
            ts = None if pd.isna(when) else when
            newer = ts is not None and (cand.last_date is None or ts >= cand.last_date)
            if newer:
                cand.last_date = ts
            add_name(cand, name, newer)
        last_team = work.groupby("pid")["team"].last()
        for pid, team in last_team.items():
            cand = get(pid)
            if cand is not None and team and team != "nan":
                if cand.last_date is not None:
                    cand.team = team

    add_games(prices, "player_id", "player_name", "game_date", "team_abbr")
    add_games(raw_logs, "PLAYER_ID", "PLAYER_NAME", "GAME_DATE", "TEAM_ABBREVIATION")

    for frame in (active, profiles):
        if frame is None or frame.empty or "player_id" not in frame.columns:
            continue
        names = frame["player_name"] if "player_name" in frame.columns else [""] * len(frame)
        for pid, name in zip(frame["player_id"], names):
            cand = get(pid)
            if cand is not None:
                add_name(cand, name, False)

    if profiles is not None and not profiles.empty and "birth_date" in profiles.columns:
        for pid, bd in zip(profiles["player_id"], profiles["birth_date"]):
            pid_num = pd.to_numeric(pid, errors="coerce")
            parsed = _parse_date(bd)
            if parsed and not pd.isna(pid_num) and int(pid_num) in by_id:
                by_id[int(pid_num)].birth_date = parsed
    return [c for c in by_id.values() if c.norms]


def _read_csv_or_empty(path: Path, **kwargs) -> pd.DataFrame:
    if not path.is_file():
        return pd.DataFrame()
    try:
        return pd.read_csv(path, **kwargs)
    except (OSError, pd.errors.EmptyDataError, ValueError):
        return pd.DataFrame()


def load_candidates(
    raw_logs: pd.DataFrame | None,
    active_csv: Path | None = None,
    profiles_csv: Path | None = None,
    prices_csv: Path | None = None,
) -> list[Candidate]:
    """Existing players from the raw-log cache, the price file, the roster and profiles."""
    active = _read_csv_or_empty(active_csv or ACTIVE_CSV)
    profiles = _read_csv_or_empty(profiles_csv or PROFILES_CSV, dtype={"birth_date": str})
    prices = _read_csv_or_empty(
        prices_csv or PRICES_CSV,
        usecols=lambda c: c in {"player_id", "player_name", "game_date", "team_abbr"},
        dtype={"player_name": str},
        low_memory=False,
    )
    return build_candidates(raw_logs, active, profiles, prices)


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _supabase_enabled() -> bool:
    flag = (os.environ.get("ESPN_PLAYER_MAP_SUPABASE") or "").strip().lower()
    if flag in ("0", "false", "no", "off"):
        return False
    return bool(os.environ.get("SUPABASE_URL") and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))


def _supabase_client():
    from supabase import create_client

    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def _execute(request, what: str):
    """Same retry-on-dropped-connection helper the price sync uses."""
    from sync_prices_to_supabase import _execute as sync_execute

    return sync_execute(request, what)


def read_map_csv(path: Path) -> dict[str, MapRow]:
    if not path.is_file():
        return {}
    out: dict[str, MapRow] = {}
    with path.open(newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            espn_id = str(row.get("espn_id") or "").strip()
            pid = pd.to_numeric(row.get("player_id"), errors="coerce")
            if not espn_id or pd.isna(pid):
                continue
            out[espn_id] = MapRow(
                espn_id,
                int(pid),
                str(row.get("player_name") or ""),
                str(row.get("matched_by") or ""),
                str(row.get("created_at") or ""),
                str(row.get("updated_at") or ""),
            )
    return out


def write_map_csv(rows: Iterable[MapRow], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ordered = sorted(rows, key=lambda r: (len(r.espn_id), r.espn_id))
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(MAP_COLUMNS)
        for r in ordered:
            writer.writerow([r.espn_id, r.player_id, r.player_name, r.matched_by, r.created_at, r.updated_at])


def read_map_supabase(client) -> dict[str, MapRow]:
    out: dict[str, MapRow] = {}
    start = 0
    while True:
        resp = _execute(
            client.table(TABLE)
            .select("espn_id,player_id,player_name,matched_by,created_at,updated_at")
            .order("espn_id")
            .range(start, start + SUPABASE_PAGE - 1),
            f"read {TABLE} rows {start}+",
        )
        batch = resp.data or []
        for row in batch:
            espn_id = str(row["espn_id"])
            out[espn_id] = MapRow(
                espn_id,
                int(row["player_id"]),
                str(row.get("player_name") or ""),
                str(row.get("matched_by") or ""),
                str(row.get("created_at") or ""),
                str(row.get("updated_at") or ""),
            )
        if len(batch) < SUPABASE_PAGE:
            return out
        start += SUPABASE_PAGE


def _check_unique(rows: dict[str, MapRow], where: str) -> None:
    seen: dict[int, str] = {}
    for r in rows.values():
        other = seen.get(r.player_id)
        if other is not None and other != r.espn_id:
            raise RuntimeError(
                f"{where}: player_id {r.player_id} is mapped to ESPN ids {other} and "
                f"{r.espn_id}. Fix the map before fetching (one player id per ESPN id).",
            )
        seen[r.player_id] = r.espn_id


# ---------------------------------------------------------------------------
# Mapper
# ---------------------------------------------------------------------------

class _Proposal(NamedTuple):
    cand: Candidate | None
    how: str
    strength: int
    dob_agrees: bool
    note: str


class EspnPlayerMapper:
    """In-memory map plus the resolution rules. Call ``persist()`` to save new rows."""

    def __init__(
        self,
        mapping: dict[str, MapRow] | None = None,
        candidates: list[Candidate] | None = None,
        *,
        csv_path: Path | None = None,
        supabase_client=None,
    ) -> None:
        self.mapping: dict[str, MapRow] = dict(mapping or {})
        _check_unique(self.mapping, "espn_player_map")
        self.csv_path = csv_path
        self.client = supabase_client
        self.pending: dict[str, MapRow] = {}
        self.report = MapReport()
        self._by_id = {r.player_id: r.espn_id for r in self.mapping.values()}
        self._by_norm: dict[str, list[Candidate]] = {}
        self._by_alias: dict[str, list[Candidate]] = {}
        self._by_last: dict[str, list[Candidate]] = {}
        self._by_first: dict[str, list[Candidate]] = {}
        cands = candidates or []
        self._known_ids = {c.player_id for c in cands}
        dates = [c.last_date for c in cands if c.last_date is not None]
        self.recent_cutoff = (max(dates) - pd.Timedelta(days=RECENT_DAYS)) if dates else None
        for cand in cands:
            for norm in cand.norms:
                self._index(self._by_norm, norm, cand)
                for alias in _aliases(norm):
                    self._index(self._by_alias, alias, cand)
                toks = _tokens(norm)
                if len(toks) >= 2:
                    self._index(self._by_last, toks[-1], cand)
                    self._index(self._by_first, toks[0], cand)

    @staticmethod
    def _index(index: dict[str, list[Candidate]], key: str, cand: Candidate) -> None:
        bucket = index.setdefault(key, [])
        if all(c is not cand for c in bucket):
            bucket.append(cand)

    # -- construction --------------------------------------------------------

    @classmethod
    def from_sources(
        cls,
        raw_logs: pd.DataFrame | None = None,
        *,
        map_csv: Path | None = None,
        active_csv: Path | None = None,
        profiles_csv: Path | None = None,
        prices_csv: Path | None = None,
        use_supabase: bool | None = None,
    ) -> "EspnPlayerMapper":
        csv_path = map_csv or MAP_CSV
        mapping: dict[str, MapRow] = {}
        client = None
        if use_supabase is None:
            use_supabase = _supabase_enabled()
        if use_supabase:
            try:
                client = _supabase_client()
                mapping = read_map_supabase(client)
                print(f"ESPN player map: loaded {len(mapping)} rows from Supabase {TABLE}.")
            except Exception as exc:  # noqa: BLE001 - table may not exist yet
                print(
                    f"WARNING: could not read Supabase {TABLE} ({type(exc).__name__}: {exc}). "
                    f"Run supabase/espn_player_map.sql once. Falling back to {csv_path.name}.",
                )
                client = None
        if client is None:
            mapping = read_map_csv(csv_path)
            if mapping:
                print(f"ESPN player map: loaded {len(mapping)} rows from {csv_path.name}.")
        candidates = load_candidates(raw_logs, active_csv, profiles_csv, prices_csv)
        return cls(mapping, candidates, csv_path=csv_path, supabase_client=client)

    def assert_safe_first_run(self, today: date | None = None) -> None:
        """
        Refuse to build the map from scratch against a stale candidate pool.

        With an empty map, every athlete is matched by name against the cached
        logs. If those logs have no recent games (e.g. the BALLDONTLIE raw-log
        cache was not restored), this season's rookies — who already trade under
        BALLDONTLIE ids — would get brand-new ids instead. Override with
        ``ESPN_MAP_ALLOW_COLD_START=1`` once you are sure.
        """
        if self.mapping:
            return
        flag = (os.environ.get("ESPN_MAP_ALLOW_COLD_START") or "").strip().lower()
        if flag in ("1", "true", "yes", "on"):
            return
        today = today or date.today()
        newest = None if self.recent_cutoff is None else (self.recent_cutoff + pd.Timedelta(days=RECENT_DAYS)).date()
        if newest is None or (today - newest).days > RECENT_DAYS:
            raise RuntimeError(
                "ESPN player map is empty and the cached game logs have no recent games "
                f"(newest {newest or 'none'}). Restore the raw-log cache (or Supabase "
                f"{TABLE}) first, or set ESPN_MAP_ALLOW_COLD_START=1 to map from scratch.",
            )

    # -- resolution ----------------------------------------------------------

    def _recent(self, c: Candidate) -> bool:
        return self.recent_cutoff is not None and c.last_date is not None and c.last_date >= self.recent_cutoff

    def _match(self, ath: Athlete, exclude: set[int]) -> _Proposal:
        norm = normalize_name(ath.name) if ath.name else ""
        if not norm:
            return _Proposal(None, "new", 0, False, "")
        dob = _parse_date(ath.dob)
        toks = _tokens(norm)
        first, last = (toks[0], toks[-1]) if len(toks) >= 2 else ("", norm)

        found: dict[int, tuple[Candidate, str, int]] = {}

        def offer(c: Candidate, how: str, strength: int) -> None:
            prev = found.get(c.player_id)
            if prev is None or strength > prev[2]:
                found[c.player_id] = (c, how, strength)

        for c in self._by_norm.get(norm, []):
            offer(c, "name", 3)
        for alias in _aliases(norm):
            for c in self._by_alias.get(alias, []):
                offer(c, "name-variant", 2)
        for c in self._by_last.get(last, []) if last else []:
            c_firsts = {_tokens(n)[0] for n in c.norms if len(_tokens(n)) >= 2 and _tokens(n)[-1] == last}
            if dob is not None and c.birth_date is not None and abs((c.birth_date - dob).days) <= DOB_TOLERANCE_DAYS:
                offer(c, "lastname+dob", 2)
            if first and ath.team and c.team == ath.team and self._recent(c):
                # Same initial ("Ace"/"Airious") is strong; a different one ("Bub"/"Carlton") is weak.
                offer(c, "team+lastname", 2 if any(f[0] == first[0] for f in c_firsts) else 1)
            if first and any(f != first and (f.startswith(first) or first.startswith(f)) for f in c_firsts):
                offer(c, "name-prefix", 1)
        if first and len(toks) >= 2:
            mine = set(toks)
            for c in self._by_first.get(first, []):
                for n in c.norms:
                    theirs = set(_tokens(n))
                    if theirs != mine and len(min(theirs, mine, key=len)) >= 2 and (theirs <= mine or mine <= theirs):
                        offer(c, "name-subset", 1)

        notes: list[str] = []
        usable: list[tuple[Candidate, str, int, bool]] = []
        for c, how, strength in found.values():
            if c.player_id in self._by_id or c.player_id in exclude:
                if strength == 3:
                    owner = self._by_id.get(c.player_id)
                    notes.append(f"exact-name id {c.player_id} already belongs to ESPN {owner or 'another athlete'}")
                continue
            agrees = dob is not None and c.birth_date is not None and abs((c.birth_date - dob).days) <= DOB_TOLERANCE_DAYS
            if dob is not None and c.birth_date is not None and not agrees:
                # A different birth date means a different person — unless the exact
                # name belongs to a player still playing (one of the feeds is wrong).
                if strength == 3 and self._recent(c):
                    notes.append(f"REVIEW: birth dates differ ({c.birth_date} on file, ESPN {dob}); matched on exact name of an active player")
                else:
                    if strength == 3:
                        notes.append(f"{c.name} ({c.player_id}) ruled out: born {c.birth_date}, ESPN says {dob}")
                    continue
            if strength == 1 and not (agrees or self._recent(c)):
                continue
            usable.append((c, how, strength, agrees))

        if not usable:
            return _Proposal(None, "new", 0, False, "; ".join(notes))

        def key(item: tuple[Candidate, str, int, bool]) -> tuple:
            # Strongest name match, then the id still playing, then birth date, then latest game.
            c, _, strength, agrees = item
            return (strength, self._recent(c), agrees, c.rank())

        best = max(usable, key=key)
        top_strength = best[2]
        # The strongest candidate has not played recently but a weaker one has:
        # the recent id is the one the market trades today.
        if not self._recent(best[0]):
            live = [u for u in usable if u[2] < top_strength and self._recent(u[0])]
            if live:
                alt = max(live, key=key)
                notes.append(
                    f"REVIEW: chose {alt[0].name!r} {alt[0].player_id} ({alt[1]}, last game "
                    f"{alt[0].when():%Y-%m-%d}) over {best[0].name!r} {best[0].player_id} "
                    f"({best[1]}, last game {_fmt(best[0])})",
                )
                best = alt
        c, how, strength, agrees = best
        same = [u for u in usable if u[2] == strength and u[0] is not c]
        if same:
            notes.append(
                f"ambiguous: chose {c.player_id} (latest game {_fmt(c)}) over "
                + ", ".join(f"{u[0].player_id} ({_fmt(u[0])})" for u in same),
            )
        if strength == 1 and not any(n.startswith("REVIEW") for n in notes):
            notes.append(f"REVIEW: matched {c.name!r} by {how}")
        if how == "name" and agrees:
            how = "name+dob"
        return _Proposal(c, how, strength, agrees, "; ".join(notes))

    def resolve_many(self, athletes: Iterable[Athlete | tuple]) -> dict[str, int]:
        """
        Map several athletes at once (ESPN id -> player id), creating mappings as needed.

        When two athletes want the same existing id, the stronger claim (exact name,
        then birth-date agreement) keeps it and the other is re-resolved without it.
        """
        out: dict[str, int] = {}
        todo: dict[str, Athlete] = {}
        for raw in athletes:
            ath = raw if isinstance(raw, Athlete) else Athlete(*raw)
            key = str(ath.espn_id).strip()
            if not key.isdigit():
                raise ValueError(f"ESPN athlete id must be numeric, got {ath.espn_id!r}")
            ath = ath._replace(espn_id=key, team=str(ath.team or ""))
            known = self.mapping.get(key) or self.pending.get(key)
            if known is not None:
                out[key] = known.player_id
            else:
                todo[key] = ath

        exclude: dict[str, set[int]] = {k: set() for k in todo}
        while todo:
            proposals = {k: self._match(a, exclude[k]) for k, a in todo.items()}
            claims: dict[int, list[str]] = {}
            for k, p in proposals.items():
                if p.cand is not None:
                    claims.setdefault(p.cand.player_id, []).append(k)
            losers: set[str] = set()
            for pid, keys in claims.items():
                if len(keys) < 2:
                    continue
                keys.sort(key=lambda k: (proposals[k].strength, proposals[k].dob_agrees), reverse=True)
                for k in keys[1:]:
                    exclude[k].add(pid)
                    losers.add(k)
            for k, p in proposals.items():
                if k in losers:
                    continue
                out[k] = self._record(todo[k], p)
            todo = {k: todo[k] for k in losers}
        return out

    def _record(self, ath: Athlete, p: _Proposal) -> int:
        if p.cand is not None:
            pid = p.cand.player_id
            how = p.how
            self.report.matched.append((ath.espn_id, ath.name, pid, how))
        else:
            pid = new_player_id(ath.espn_id)
            how = "new"
            if pid in self._by_id or pid in self._known_ids:
                # Backstop: never let a new id merge two players.
                raise RuntimeError(
                    f"New id {pid} for ESPN {ath.espn_id} ({ath.name}) is already used by an existing "
                    "player. Add a manual row to espn_player_map for this athlete.",
                )
            self.report.new.append((ath.espn_id, ath.name, pid))
        if p.note:
            self.report.review.append(f"ESPN {ath.espn_id} {ath.name!r} -> {pid}: {p.note}")
        now = _now_iso()
        self.pending[ath.espn_id] = MapRow(ath.espn_id, pid, ath.name, how, now, now)
        self._by_id[pid] = ath.espn_id
        return pid

    def resolve(self, espn_id: object, name: str = "", dob: object = None, team: str = "") -> int:
        """Existing player id for one ESPN athlete (creating and recording a mapping if needed)."""
        key = str(espn_id).strip()
        return self.resolve_many([Athlete(key, name, dob, team)])[key]

    def lookup(self, espn_id: object) -> int | None:
        row = self.mapping.get(str(espn_id)) or self.pending.get(str(espn_id))
        return row.player_id if row else None

    def unknown(self, espn_ids: Iterable[object]) -> set[str]:
        return {str(e) for e in espn_ids if self.lookup(e) is None}

    # -- persistence ---------------------------------------------------------

    def all_rows(self) -> dict[str, MapRow]:
        merged = dict(self.mapping)
        merged.update(self.pending)
        return merged

    def persist(self) -> int:
        """Save rows created since load. Returns how many were new."""
        new_rows = list(self.pending.values())
        if not new_rows:
            return 0
        if self.client is not None:
            payload = [
                {
                    "espn_id": r.espn_id,
                    "player_id": r.player_id,
                    "player_name": r.player_name[:512],
                    "matched_by": r.matched_by,
                    "updated_at": r.updated_at,
                }
                for r in new_rows
            ]
            try:
                for i in range(0, len(payload), 500):
                    _execute(
                        self.client.table(TABLE).upsert(payload[i : i + 500], on_conflict="espn_id"),
                        f"upsert {TABLE} rows {i}+",
                    )
                print(f"ESPN player map: upserted {len(payload)} new rows to Supabase {TABLE}.")
            except Exception as exc:  # noqa: BLE001 - keep the local mirror even if Supabase refuses
                print(f"WARNING: could not upsert {TABLE} ({type(exc).__name__}: {exc}).")
        if self.csv_path is not None:
            write_map_csv(self.all_rows().values(), self.csv_path)
            try:
                shown = self.csv_path.relative_to(ROOT)
            except ValueError:
                shown = self.csv_path
            print(f"ESPN player map: wrote {len(self.all_rows())} rows -> {shown}")
        self.mapping.update(self.pending)
        self.pending = {}
        self.report = MapReport()  # the summary covers rows since the last save
        return len(new_rows)

    # -- reporting -----------------------------------------------------------

    def summary(self, *, max_list: int = 60) -> str:
        r = self.report
        by_how: dict[str, int] = {}
        for *_, how in r.matched:
            by_how[how] = by_how.get(how, 0) + 1
        lines = [
            "ESPN player map: "
            f"{len(r.matched)} matched to existing ids "
            f"({', '.join(f'{k} {v}' for k, v in sorted(by_how.items())) or 'none'}), "
            f"{len(r.new)} new, {len(r.review)} to review.",
        ]
        if r.new:
            lines.append(f"  New players (id = {NEW_PLAYER_ID_OFFSET} + ESPN id):")
            for espn_id, name, pid in r.new[:max_list]:
                lines.append(f"    {name} (ESPN {espn_id}) -> {pid}")
            if len(r.new) > max_list:
                lines.append(f"    … and {len(r.new) - max_list} more")
        if r.review:
            lines.append("  Review:")
            for note in r.review[:max_list]:
                lines.append(f"    {note}")
            if len(r.review) > max_list:
                lines.append(f"    … and {len(r.review) - max_list} more")
        return "\n".join(lines)

    def print_summary(self) -> None:
        if self.report.matched or self.report.new or self.report.review:
            print(self.summary())


def _fmt(c: Candidate) -> str:
    return "never" if c.last_date is None else f"{c.when():%Y-%m-%d}"
