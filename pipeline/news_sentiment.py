"""
RSS news sentiment -> per-player ``headline_score`` for the sentiment lever.

Free, keyless, and quota-free: instead of one API call per player (which blows
through every free news-API tier), we pull a few *league-wide* NBA RSS feeds,
match each headline to players by normalised name, and score the matched text
with VADER (a lightweight rule-based sentiment analyzer). Cost is constant — 450
players cost the same as 1 because we never query per player.

Built to FAIL SAFE, exactly like the ESPN injury feed: any network error, feed
shape change, or a missing VADER install returns ``{}`` and the sentiment lever
stays neutral. A flaky feed can never break the pipeline — it just goes quiet.

Output: ``{normalized_name: headline_score}`` with headline_score in [-1, 1].
"""
from __future__ import annotations

import urllib.request
import xml.etree.ElementTree as ET

from espn_injuries import normalize_name

# League-wide NBA feeds (public, no key). Add/remove freely — failures are
# isolated per feed, so one dead feed doesn't sink the rest.
NBA_RSS_FEEDS: tuple[str, ...] = (
    "https://www.espn.com/espn/rss/nba/news",
    "https://www.cbssports.com/rss/headlines/nba/",
    "https://sports.yahoo.com/nba/rss/",
    "https://www.reddit.com/r/nba/.rss",
)

_USER_AGENT = "Mozilla/5.0 (hoops-stock-market pipeline)"

# Lazy VADER analyzer. If the dependency is missing we degrade to neutral.
try:
    from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

    _ANALYZER: "SentimentIntensityAnalyzer | None" = SentimentIntensityAnalyzer()
except Exception:  # noqa: BLE001
    _ANALYZER = None


def _strip_ns(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def extract_items(xml_bytes: bytes) -> list[str]:
    """Parse RSS 2.0 or Atom bytes into a list of 'title. summary' text blobs."""
    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return []

    items: list[str] = []
    for el in root.iter():
        if _strip_ns(el.tag) not in ("item", "entry"):
            continue
        title = ""
        summary = ""
        for child in el:
            name = _strip_ns(child.tag)
            text = (child.text or "").strip()
            if name == "title" and not title:
                title = text
            elif name in ("description", "summary", "content") and not summary:
                summary = text
        blob = f"{title}. {summary}".strip()
        if blob and blob != ".":
            items.append(blob)
    return items


def score_text(text: str) -> float:
    """VADER compound polarity in [-1, 1]; 0.0 if scoring is unavailable."""
    if _ANALYZER is None or not text:
        return 0.0
    try:
        return float(_ANALYZER.polarity_scores(text)["compound"])
    except Exception:  # noqa: BLE001
        return 0.0


def aggregate_player_sentiment(
    item_texts: list[str],
    player_names: list[str],
) -> dict[str, float]:
    """
    Average VADER score of headlines mentioning each player.

    Players are matched by full normalised name as a padded substring (so
    'lebron james' matches but a lone 'jordan' does not). Only players with at
    least one mention appear in the result.
    """
    # Map padded normalised full name -> normalised key, requiring 2+ tokens to
    # avoid spurious single-name matches.
    name_keys: dict[str, str] = {}
    for raw in player_names:
        key = normalize_name(raw)
        if len(key.split()) >= 2:
            name_keys[f" {key} "] = key

    if not name_keys or not item_texts:
        return {}

    sums: dict[str, float] = {}
    counts: dict[str, int] = {}
    for text in item_texts:
        padded = f" {normalize_name(text)} "
        matched = [key for needle, key in name_keys.items() if needle in padded]
        if not matched:
            continue
        score = score_text(text)
        for key in matched:
            sums[key] = sums.get(key, 0.0) + score
            counts[key] = counts.get(key, 0) + 1

    out: dict[str, float] = {}
    for key, total in sums.items():
        avg = total / counts[key]
        out[key] = max(-1.0, min(1.0, avg))
    return out


def fetch_news_sentiment(
    player_names: list[str],
    feeds: tuple[str, ...] = NBA_RSS_FEEDS,
    timeout: float = 20.0,
) -> dict[str, float]:
    """
    Fetch league-wide NBA feeds and return ``{normalized_name: headline_score}``.

    Never raises: per-feed failures are skipped and a total failure returns ``{}``.
    """
    if _ANALYZER is None or not player_names:
        return {}

    item_texts: list[str] = []
    for url in feeds:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": _USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                item_texts.extend(extract_items(resp.read()))
        except Exception:  # noqa: BLE001 - isolate per-feed failures
            continue

    if not item_texts:
        return {}
    return aggregate_player_sentiment(item_texts, player_names)


if __name__ == "__main__":  # quick manual probe
    sample = ["LeBron James", "Stephen Curry", "Giannis Antetokounmpo", "Jalen Brunson"]
    data = fetch_news_sentiment(sample)
    print(f"matched {len(data)} of {len(sample)} sample players")
    for k, v in data.items():
        print(f"  {k}: {v:+.3f}")
