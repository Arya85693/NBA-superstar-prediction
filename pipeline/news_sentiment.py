"""
RSS news sentiment -> per-player news signal for the sentiment lever.

Free, keyless, and quota-free: instead of one API call per player (which blows
through every free news-API tier), we pull a few *league-wide* NBA RSS feeds,
match each headline to players by normalised name, and score the matched text
with VADER (a lightweight rule-based sentiment analyzer). Cost is constant — 450
players cost the same as 1 because we never query per player.

Tier-1 shaping:
  * Recency-weighted: a headline's influence halves every
    ``half_life_days`` (today's news outweighs stale news).
  * Returns ``article_count`` so the sentiment engine can scale confidence
    (one lucky headline shouldn't swing price like five corroborating ones).
  * Returns the top matched ``headlines`` so the price is *explainable*
    ("Driven by: 'Player drops 40 in win'").

Built to FAIL SAFE, exactly like the ESPN injury feed: any network error, feed
shape change, or a missing VADER install returns ``{}`` and the sentiment lever
stays neutral. A flaky feed can never break the pipeline — it just goes quiet.

Output: ``{normalized_name: {"score", "article_count", "headlines"}}`` where
``score`` is in [-1, 1] and ``headlines`` is a list of ``{"title", "score"}``.
"""
from __future__ import annotations

import urllib.request
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from espn_injuries import normalize_name

# League-wide NBA feeds (public, no key). Add/remove freely — failures are
# isolated per feed, so one dead feed doesn't sink the rest.
NBA_RSS_FEEDS: tuple[str, ...] = (
    "https://www.espn.com/espn/rss/nba/news",
    "https://www.cbssports.com/rss/headlines/nba/",
    "https://sports.yahoo.com/nba/rss/",
    "https://www.reddit.com/r/nba/.rss",
    "https://basketball.realgm.com/rss/wiretap/0/0.xml",
    "https://www.sbnation.com/rss/nba/index.xml",
    "https://www.fadeawayworld.net/feed",
    "https://www.clutchpoints.com/feed",
)

_USER_AGENT = "Mozilla/5.0 (hoops-stock-market pipeline)"

# How many headlines to keep per player for the explanation.
_MAX_HEADLINES = 3

# Tier-2: domain lexicon. VADER is trained on general/social text and is blind to
# basketball jargon ("waived", "questionable", "triple-double"). We teach it the
# words that actually move a player's narrative so headlines score sensibly.
# Values are VADER-scale valences (roughly [-4, 4]); single tokens + the common
# hyphenated forms (VADER keeps internal hyphens as one token).
NBA_LEXICON: dict[str, float] = {
    # negative — availability / discipline / poor play
    "out": -1.4, "doubtful": -1.5, "questionable": -0.8,
    "injury": -1.6, "injured": -1.9, "injuries": -1.6,
    "sidelined": -1.9, "sprain": -1.5, "strain": -1.3, "surgery": -2.3,
    "ruptured": -2.6, "torn": -2.5, "acl": -2.2, "fracture": -2.2,
    "ejected": -1.4, "ejection": -1.4, "suspended": -2.1, "suspension": -1.9,
    "waived": -1.6, "benched": -1.3, "slump": -1.8, "slumping": -1.8,
    "struggling": -1.4, "dnp": -1.3, "fined": -1.0, "setback": -1.5,
    # positive — health / accolades / hot play
    "clutch": 2.0, "dominant": 2.2, "dominates": 2.0, "dominated": 1.8,
    "mvp": 2.5, "allstar": 2.0, "all-star": 2.0, "all-nba": 2.2,
    "triple-double": 2.3, "double-double": 1.4, "career-high": 2.5,
    "scorching": 1.8, "buzzer-beater": 2.2, "thriving": 1.8, "sizzling": 1.8,
    "extension": 1.2, "returns": 0.9, "cleared": 1.6, "healthy": 1.3,
    "upgraded": 1.4, "probable": 0.8,
}

# Tier-2: nickname aliases -> canonical full name. A headline that says "Steph"
# or "The Greek Freak" should still land on the right player. Aliases are only
# activated for players actually in the board, so they can't mis-tag someone who
# isn't trading.
NICKNAME_ALIASES: dict[str, str] = {
    "king james": "LeBron James",
    "the king": "LeBron James",
    "steph": "Stephen Curry",
    "chef curry": "Stephen Curry",
    "the greek freak": "Giannis Antetokounmpo",
    "greek freak": "Giannis Antetokounmpo",
    "the joker": "Nikola Jokic",
    "kd": "Kevin Durant",
    "the beard": "James Harden",
    "cp3": "Chris Paul",
    "dame": "Damian Lillard",
    "the brow": "Anthony Davis",
    "ad": "Anthony Davis",
    "pg13": "Paul George",
    "klay": "Klay Thompson",
    "luka": "Luka Doncic",
    "the klaw": "Kawhi Leonard",
    "spida": "Donovan Mitchell",
    "jimmy buckets": "Jimmy Butler",
    "the freak": "Giannis Antetokounmpo",
}

# Lazy VADER analyzer. If the dependency is missing we degrade to neutral.
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

    _ANALYZER: "SentimentIntensityAnalyzer | None" = SentimentIntensityAnalyzer()
    _ANALYZER.lexicon.update(NBA_LEXICON)
except Exception:  # noqa: BLE001
    _ANALYZER = None


@dataclass
class NewsItem:
    title: str          # human-readable headline (for explanation)
    text: str           # title + summary (for scoring & name matching)
    age_days: float     # how old the headline is (for recency weighting)


@dataclass
class PlayerNews:
    score: float = 0.0
    article_count: int = 0
    headlines: list[dict] = field(default_factory=list)  # [{"title","score"}]


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _parse_age_days(value: str | None, now: datetime) -> float:
    """Best-effort age in days from an RSS/Atom date; 0.0 (fresh) if unknown."""
    if not value:
        return 0.0
    dt = None
    try:
        dt = parsedate_to_datetime(value)  # RSS 2.0: RFC-822
    except (TypeError, ValueError, IndexError):
        dt = None
    if dt is None:
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))  # Atom: ISO-8601
        except ValueError:
            return 0.0
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    age = (now - dt).total_seconds() / 86400.0
    return max(0.0, age)


def extract_items(xml_bytes: bytes, now: datetime | None = None) -> list[NewsItem]:
    """Parse RSS 2.0 or Atom bytes into NewsItems (title, text, age_days)."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []

    now = now or datetime.now(timezone.utc)
    items: list[NewsItem] = []
    for el in root.iter():
        if _strip_ns(el.tag) not in ("item", "entry"):
            continue
        title = ""
        summary = ""
        date_str = None
        for child in el:
            name = _strip_ns(child.tag)
            text = (child.text or "").strip()
            if name == "title" and not title:
                title = text
            elif name in ("description", "summary", "content") and not summary:
                summary = text
            elif name in ("pubDate", "published", "updated") and date_str is None:
                date_str = text
        if not title:
            continue
        blob = f"{title}. {summary}".strip()
        items.append(
            NewsItem(title=title, text=blob, age_days=_parse_age_days(date_str, now))
        )
    return items


def score_text(text: str) -> float:
    """VADER compound polarity in [-1, 1]; 0.0 if scoring is unavailable."""
    if _ANALYZER is None or not text:
        return 0.0
    try:
        return float(_ANALYZER.polarity_scores(text)["compound"])
    except Exception:  # noqa: BLE001
        return 0.0


def _recency_weight(age_days: float, half_life_days: float) -> float:
    if half_life_days <= 0:
        return 1.0
    return 0.5 ** (max(0.0, age_days) / half_life_days)


def aggregate_player_sentiment(
    items: list[NewsItem],
    player_names: list[str],
    half_life_days: float = 3.0,
    aliases: dict[str, str] | None = None,
) -> dict[str, PlayerNews]:
    """
    Recency-weighted news score per player, plus article count and top headlines.

    Players are matched by full normalised name as a padded substring (so
    'lebron james' matches but a lone 'jordan' does not). Known nicknames in
    ``aliases`` ({nickname: full name}) are also matched, but only for players
    that are actually on the board. Only players with at least one mention appear
    in the result. ``score`` is the recency-weighted average VADER compound
    across all matched headlines, clamped to [-1, 1].
    """
    name_keys: dict[str, str] = {}
    for raw in player_names:
        key = normalize_name(raw)
        if len(key.split()) >= 2:
            name_keys[f" {key} "] = key

    if not name_keys or not items:
        return {}

    # Activate nickname needles only for canonical names that are on the board.
    active = set(name_keys.values())
    alias_map = NICKNAME_ALIASES if aliases is None else aliases
    for nick, full in alias_map.items():
        canonical = normalize_name(full)
        if canonical not in active:
            continue
        nkey = normalize_name(nick)
        if nkey:
            name_keys[f" {nkey} "] = canonical

    weighted_sum: dict[str, float] = {}
    weight_total: dict[str, float] = {}
    counts: dict[str, int] = {}
    headlines: dict[str, list[dict]] = {}

    for item in items:
        padded = f" {normalize_name(item.text)} "
        # dedupe: a headline naming both "LeBron James" and "King James" is one
        # mention of one player, not two.
        matched = list({key for needle, key in name_keys.items() if needle in padded})
        if not matched:
            continue
        score = score_text(item.text)
        weight = _recency_weight(item.age_days, half_life_days)
        for key in matched:
            weighted_sum[key] = weighted_sum.get(key, 0.0) + score * weight
            weight_total[key] = weight_total.get(key, 0.0) + weight
            counts[key] = counts.get(key, 0) + 1
            headlines.setdefault(key, []).append(
                {"title": item.title, "score": round(score, 4), "age_days": item.age_days}
            )

    out: dict[str, PlayerNews] = {}
    for key, wsum in weighted_sum.items():
        denom = weight_total[key] or 1.0
        avg = max(-1.0, min(1.0, wsum / denom))
        # Keep the freshest, then most opinionated headlines for the explanation.
        tops = sorted(
            headlines[key], key=lambda h: (h["age_days"], -abs(h["score"]))
        )[:_MAX_HEADLINES]
        out[key] = PlayerNews(
            score=avg,
            article_count=counts[key],
            headlines=[{"title": h["title"], "score": h["score"]} for h in tops],
        )
    return out


def fetch_news_sentiment(
    player_names: list[str],
    feeds: tuple[str, ...] = NBA_RSS_FEEDS,
    timeout: float = 20.0,
    half_life_days: float = 3.0,
) -> dict[str, PlayerNews]:
    """
    Fetch league-wide NBA feeds and return ``{normalized_name: PlayerNews}``.

    Never raises: per-feed failures are skipped and a total failure returns ``{}``.
    """
    if _ANALYZER is None or not player_names:
        return {}

    now = datetime.now(timezone.utc)
    items: list[NewsItem] = []
    for url in feeds:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                items.extend(extract_items(resp.read(), now=now))
        except Exception:  # noqa: BLE001 - isolate per-feed failures
            continue

    if not items:
        return {}
    return aggregate_player_sentiment(items, player_names, half_life_days)


if __name__ == "__main__":  # quick manual probe
    sample = ["LeBron James", "Stephen Curry", "Giannis Antetokounmpo", "Jalen Brunson"]
    data = fetch_news_sentiment(sample)
    print(f"matched {len(data)} of {len(sample)} sample players")
    for k, v in data.items():
        print(f"  {k}: score={v.score:+.3f} n={v.article_count} top={v.headlines[:1]}")
