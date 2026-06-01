"""News sentiment — RSS parsing, name matching, scoring (no network)."""
from news_sentiment import (
    aggregate_player_sentiment,
    extract_items,
    score_text,
)

RSS_SAMPLE = b"""<?xml version='1.0'?>
<rss version='2.0'><channel>
  <item><title>LeBron James drops 40 in dazzling win</title>
        <description>A brilliant, dominant performance.</description></item>
  <item><title>Stephen Curry struggles in ugly loss</title>
        <description>A terrible, disappointing night.</description></item>
</channel></rss>"""

ATOM_SAMPLE = b"""<?xml version='1.0'?>
<feed xmlns='http://www.w3.org/2005/Atom'>
  <entry><title>Giannis Antetokounmpo posts triple-double</title>
         <summary>Great all-around game.</summary></entry>
</feed>"""


def test_extract_items_rss():
    items = extract_items(RSS_SAMPLE)
    assert len(items) == 2
    assert "LeBron James" in items[0]
    assert "brilliant" in items[0]


def test_extract_items_atom():
    items = extract_items(ATOM_SAMPLE)
    assert len(items) == 1
    assert "Giannis Antetokounmpo" in items[0]


def test_extract_items_handles_garbage():
    assert extract_items(b"not xml at all") == []


def test_matches_full_name_only():
    items = ["LeBron James drops 40 in dazzling win"]
    out = aggregate_player_sentiment(items, ["LeBron James", "Anthony Davis"])
    assert "lebron james" in out
    assert "anthony davis" not in out  # not mentioned


def test_single_token_names_are_ignored():
    # A lone first name must not match (avoids false positives).
    items = ["James scored a lot"]
    out = aggregate_player_sentiment(items, ["James"])
    assert out == {}


def test_positive_vs_negative_headlines_sign():
    items = extract_items(RSS_SAMPLE)
    out = aggregate_player_sentiment(items, ["LeBron James", "Stephen Curry"])
    # VADER should rate the dazzling win above the ugly loss.
    if "lebron james" in out and "stephen curry" in out:
        assert out["lebron james"] > out["stephen curry"]


def test_scores_are_clamped():
    items = extract_items(RSS_SAMPLE)
    out = aggregate_player_sentiment(items, ["LeBron James", "Stephen Curry"])
    for v in out.values():
        assert -1.0 <= v <= 1.0


def test_score_text_empty_is_zero():
    assert score_text("") == 0.0


def test_no_players_returns_empty():
    assert aggregate_player_sentiment(["some headline"], []) == {}
