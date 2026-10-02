from datetime import datetime, timedelta

from app.etl.ingest_odds import (
    GAME_ODDS_LOOKAHEAD_HOURS,
    GAME_ODDS_MIN_REFRESH_HOURS,
    normalize_team_name,
    should_pull_game_odds,
    team_name_matches,
)

NOW = datetime(2026, 10, 10, 12, 0)


def test_normalize_team_name_strips_accents_and_punctuation():
    assert normalize_team_name("Montréal Canadiens") == "montreal canadiens"
    assert normalize_team_name("St. Louis Blues") == "st louis blues"


def test_team_name_matches_ignores_accents():
    assert team_name_matches("Montréal Canadiens", "Montreal Canadiens")
    assert team_name_matches("Montreal Canadiens", "Montréal Canadiens")


def test_team_name_matches_full_and_nickname_only_names():
    assert team_name_matches("Boston Bruins", "Boston Bruins")
    assert team_name_matches("Boston Bruins", "Bruins")
    assert not team_name_matches("New York Rangers", "New York Islanders")


def test_team_name_matches_requires_a_word_boundary():
    assert not team_name_matches("Carolina Hurricanes", "canes")
    assert not team_name_matches("Boston Bruins", "")


def test_pull_is_skipped_when_odds_were_fetched_recently():
    recent = NOW - timedelta(hours=GAME_ODDS_MIN_REFRESH_HOURS - 1)
    assert not should_pull_game_odds(recent, NOW + timedelta(hours=5), NOW)


def test_pull_is_skipped_when_no_game_is_close():
    assert not should_pull_game_odds(None, None, NOW)
    assert not should_pull_game_odds(None, NOW + timedelta(hours=GAME_ODDS_LOOKAHEAD_HOURS + 1), NOW)


def test_pull_happens_when_stale_and_a_game_is_close():
    stale = NOW - timedelta(hours=GAME_ODDS_MIN_REFRESH_HOURS + 1)
    assert should_pull_game_odds(stale, NOW + timedelta(hours=5), NOW)
    assert should_pull_game_odds(None, NOW + timedelta(hours=5), NOW)
