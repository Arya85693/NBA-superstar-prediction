"""Sentiment engine — injury severity / headline polarity -> bounded score."""
from espn_injuries import normalize_name, severity_from_status
from sentiment_engine import SentimentInput, compute_sentiment


def test_none_is_neutral():
    assert compute_sentiment(None).score == 0.0


def test_empty_input_is_neutral():
    assert compute_sentiment(SentimentInput()).score == 0.0


def test_injury_severity_is_negative():
    res = compute_sentiment(SentimentInput(injury_severity=0.8, injury_status="Out"))
    assert res.score < 0.0
    assert res.signals["injury"] < 0.0


def test_out_hits_harder_than_day_to_day():
    out = compute_sentiment(SentimentInput(injury_severity=0.8)).score
    dtd = compute_sentiment(SentimentInput(injury_severity=0.25)).score
    assert out < dtd < 0.0


def test_legacy_injury_flag_still_works():
    res = compute_sentiment(SentimentInput(injury_flag=True))
    assert res.score < 0.0


def test_headline_polarity_flows_through():
    pos = compute_sentiment(SentimentInput(headline_score=0.6)).score
    neg = compute_sentiment(SentimentInput(headline_score=-0.6)).score
    assert pos > 0.0 > neg


def test_confidence_scales_with_article_count():
    # Same polarity, more corroborating articles => stronger signal.
    one = compute_sentiment(
        SentimentInput(headline_score=0.9, article_count=1), full_confidence_articles=3
    ).score
    three = compute_sentiment(
        SentimentInput(headline_score=0.9, article_count=3), full_confidence_articles=3
    ).score
    assert 0.0 < one < three
    # One of three articles => ~1/3 of full strength.
    assert abs(one - 0.9 / 3.0) < 1e-6


def test_confidence_caps_at_full():
    capped = compute_sentiment(
        SentimentInput(headline_score=0.5, article_count=99), full_confidence_articles=3
    ).score
    assert abs(capped - 0.5) < 1e-6


def test_top_headline_appears_in_notes():
    res = compute_sentiment(
        SentimentInput(headline_score=0.8, article_count=3, top_headline="Star drops 40")
    )
    assert any("Star drops 40" in n for n in res.notes)


def test_score_is_clamped():
    res = compute_sentiment(
        SentimentInput(headline_score=-1.0, injury_severity=1.0)
    )
    assert -1.0 <= res.score <= 1.0
    assert res.score == -1.0


def test_severity_from_status_mapping():
    assert severity_from_status("Out") == 0.8
    assert severity_from_status("Day-To-Day") == 0.25
    assert severity_from_status("Out For Season") == 1.0
    assert severity_from_status("Active") == 0.0
    assert severity_from_status(None) == 0.0


def test_normalize_name_handles_accents_and_suffixes():
    assert normalize_name("Luka Dončić") == "luka doncic"
    assert normalize_name("Jaren Jackson Jr.") == "jaren jackson"
    assert normalize_name("Jimmy Butler III") == "jimmy butler"
