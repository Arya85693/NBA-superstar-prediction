"""News sentiment — RSS parsing, name matching, recency, headlines (no network)."""
from datetime import datetime, timezone

from news_sentiment import (
    NewsItem,
    aggregate_player_sentiment,
    extract_items,
    score_text,
)
import news_sentiment

NOW = datetime(2026, 6, 1, tzinfo=timezone.utc)

RSS_SAMPLE = b"""<?xml version='1.0'?>
<rss version='2.0'><channel>
  <item><title>LeBron James drops 40 in dazzling win</title>
        <description>A brilliant, dominant performance.</description>
        <pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item>
  <item><title>Stephen Curry struggles in ugly loss</title>
        <description>A terrible, disappointing night.</description>
        <pubDate>Mon, 01 Jun 2026 00:00:00 GMT</pubDate></item>
</channel></rss>"""

ATOM_SAMPLE = b"""<?xml version='1.0'?>
<feed xmlns='http://www.w3.org/2005/Atom'>
  <entry><title>Giannis Antetokounmpo posts triple-double</title>
         <summary>Great all-around game.</summary>
         <updated>2026-06-01T00:00:00Z</updated></entry>
</feed>"""


def test_extract_items_rss():
    items = extract_items(RSS_SAMPLE, now=NOW)
    assert len(items) == 2
    assert "LeBron James" in items[0].title
    assert "brilliant" in items[0].text
    assert items[0].age_days == 0.0


def test_extract_items_atom():
    items = extract_items(ATOM_SAMPLE, now=NOW)
    assert len(items) == 1
    assert "Giannis Antetokounmpo" in items[0].title


def test_extract_items_handles_garbage():
    assert extract_items(b"not xml at all") == []


def test_matches_full_name_only():
    items = [NewsItem("LeBron James drops 40", "LeBron James drops 40 in win", 0.0)]
    out = aggregate_player_sentiment(items, ["LeBron James", "Anthony Davis"])
    assert "lebron james" in out
    assert "anthony davis" not in out


def test_single_token_names_are_ignored():
    items = [NewsItem("James scored", "James scored a lot", 0.0)]
    out = aggregate_player_sentiment(items, ["James"])
    assert out == {}


def test_article_count_and_headlines_returned():
    items = [
        NewsItem("LeBron James drops 40 in win", "LeBron James drops 40 in win", 0.0),
        NewsItem("LeBron James leads comeback", "LeBron James leads comeback", 0.0),
    ]
    out = aggregate_player_sentiment(items, ["LeBron James"])
    pn = out["lebron james"]
    assert pn.article_count == 2
    assert len(pn.headlines) == 2
    assert "title" in pn.headlines[0] and "score" in pn.headlines[0]


def test_positive_vs_negative_headlines_sign():
    items = extract_items(RSS_SAMPLE, now=NOW)
    out = aggregate_player_sentiment(items, ["LeBron James", "Stephen Curry"])
    if "lebron james" in out and "stephen curry" in out:
        assert out["lebron james"].score > out["stephen curry"].score


def test_recency_weighting_favors_fresh_news():
    # Same player: a fresh positive headline and a stale negative one. The fresh
    # one should dominate the recency-weighted average (-> positive).
    items = [
        NewsItem(
            "LeBron James brilliant dazzling win",
            "LeBron James brilliant dazzling win great",
            age_days=0.0,
        ),
        NewsItem(
            "LeBron James terrible awful loss",
            "LeBron James terrible awful loss bad",
            age_days=30.0,
        ),
    ]
    out = aggregate_player_sentiment(items, ["LeBron James"], half_life_days=3.0)
    assert out["lebron james"].score > 0.0


def test_scores_are_clamped():
    items = extract_items(RSS_SAMPLE, now=NOW)
    out = aggregate_player_sentiment(items, ["LeBron James", "Stephen Curry"])
    for pn in out.values():
        assert -1.0 <= pn.score <= 1.0


def test_score_text_empty_is_zero():
    assert score_text("") == 0.0


def test_no_players_returns_empty():
    items = [NewsItem("some headline", "some headline text", 0.0)]
    assert aggregate_player_sentiment(items, []) == {}


# --- Tier 2: basketball lexicon ----------------------------------------------

def test_basketball_lexicon_scores_jargon():
    # These words are neutral to vanilla VADER but loaded in basketball.
    if news_sentiment._ANALYZER is None:
        return  # VADER not installed -> degrades to neutral, nothing to assert
    assert score_text("Star forward waived after surgery, out indefinitely") < 0.0
    assert score_text("Guard cleared, returns healthy and clutch") > 0.0


def test_lexicon_makes_injury_headline_negative_for_player():
    items = [
        NewsItem(
            "Kawhi Leonard out, sidelined after knee surgery",
            "Kawhi Leonard out, sidelined after knee surgery setback",
            0.0,
        ),
    ]
    out = aggregate_player_sentiment(items, ["Kawhi Leonard"])
    if news_sentiment._ANALYZER is not None:
        assert out["kawhi leonard"].score < 0.0


# --- Tier 2: nickname aliases -------------------------------------------------

def test_nickname_alias_matches_active_player():
    items = [NewsItem("The Greek Freak dominant tonight", "The Greek Freak dominant tonight", 0.0)]
    out = aggregate_player_sentiment(items, ["Giannis Antetokounmpo"])
    assert "giannis antetokounmpo" in out
    assert out["giannis antetokounmpo"].article_count == 1


def test_nickname_alias_ignored_when_player_not_on_board():
    # "Steph" -> Stephen Curry, but Curry isn't on the board -> no phantom match.
    items = [NewsItem("Steph goes off for 50", "Steph goes off for 50", 0.0)]
    out = aggregate_player_sentiment(items, ["LeBron James"])
    assert out == {}


def test_full_name_and_nickname_not_double_counted():
    items = [
        NewsItem(
            "LeBron James, the King James show, dazzles",
            "LeBron James, the King James show, dazzles",
            0.0,
        ),
    ]
    out = aggregate_player_sentiment(items, ["LeBron James"])
    assert out["lebron james"].article_count == 1


def test_custom_alias_map_overrides_default():
    items = [NewsItem("Greek Freak dominant", "Greek Freak dominant", 0.0)]
    out = aggregate_player_sentiment(
        items, ["Giannis Antetokounmpo"], aliases={}
    )
    assert out == {}
