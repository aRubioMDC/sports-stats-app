import math
from datetime import datetime, timedelta

import pytest

from app.core import calibration as cal
from app.core import game_model as gm
from app.core import prediction_service as ps
from app.etl.backtest_prediction import MIN_TARGET_GAMES, FinishedGame, run_backtest


def test_brier_score_perfect_and_coin_flip():
    assert cal.brier_score([1.0, 0.0], [True, False]) == 0.0
    assert cal.brier_score([0.5, 0.5], [True, False]) == pytest.approx(0.25)


def test_log_loss_matches_the_formula_and_clamps_certainty():
    assert cal.log_loss([0.8], [True]) == pytest.approx(-math.log(0.8))
    assert cal.log_loss([0.8], [False]) == pytest.approx(-math.log(0.2))
    assert math.isfinite(cal.log_loss([0.0], [True]))


def test_mean_absolute_error():
    assert cal.mean_absolute_error([5.0, 6.0], [4.0, 9.0]) == pytest.approx(2.0)


def test_calibration_bins_group_and_skip_empty_bins():
    bins = cal.calibration_bins([0.05, 0.08, 0.95, 1.0], [False, False, True, True], bins=10)

    assert [(b.low, b.count) for b in bins] == [(0.0, 2), (0.9, 2)]
    assert bins[0].observed_rate == 0.0
    assert bins[1].mean_predicted == pytest.approx(0.975)
    assert bins[1].observed_rate == 1.0


def test_metrics_reject_empty_or_mismatched_inputs():
    with pytest.raises(ValueError):
        cal.brier_score([], [])
    with pytest.raises(ValueError):
        cal.log_loss([0.5], [True, False])


def _season(season: int, games_per_day: int = 4, days: int = 60) -> list[FinishedGame]:
    """Team 1 always beats team 2; everyone else splits evenly. Deterministic and offline."""
    start = datetime(2025, 10, 1) if season == 2 else datetime(2024, 10, 1)
    games = []
    for day in range(days):
        for slot in range(games_per_day):
            home, away = (1 + slot * 2, 2 + slot * 2)
            home_score, away_score = (4, 1) if slot == 0 else (3, 2) if day % 2 else (2, 3)
            games.append(
                FinishedGame(
                    kickoff=start + timedelta(days=day, hours=slot),
                    season=season,
                    result=gm.GameResult(home, away, home_score, away_score),
                )
            )
    return games


def test_backtest_beats_a_coin_flip_when_results_are_predictable():
    games = _season(1) + _season(2)

    report = run_backtest("nhl", season=2, previous_season=1, games=games)

    assert report.games >= MIN_TARGET_GAMES
    assert report.brier < report.brier_coin_flip
    assert report.log_loss < report.log_loss_coin_flip
    assert 0.0 <= report.over_brier <= 1.0


def test_backtest_never_uses_results_from_the_game_being_predicted(monkeypatch):
    games = _season(1) + _season(2)
    seen_sizes = []
    original = ps.project_game

    def spy(sport, results, home_id, away_id):
        seen_sizes.append(len(results))
        return original(sport, results, home_id, away_id)

    monkeypatch.setattr(ps, "project_game", spy)
    run_backtest("nhl", season=2, previous_season=1, games=games)

    prior_games = len([g for g in games if g.season == 1])
    # Games at the same kickoff share a history, and history only ever grows.
    assert seen_sizes[0] == prior_games
    assert seen_sizes == sorted(seen_sizes)
    assert seen_sizes[-1] < len(games)


def test_backtest_requires_enough_games():
    with pytest.raises(ValueError):
        run_backtest("nhl", season=2, previous_season=1, games=_season(1, days=2) + _season(2, days=2))
