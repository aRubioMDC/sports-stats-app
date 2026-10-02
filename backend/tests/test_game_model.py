"""Unit tests for the pure game model: no database or network required."""

import math

import pytest

from app.core import game_model as gm


def _results(n: int = 40) -> list[gm.GameResult]:
    # Teams 1..4 rotate; team 1 is a strong offense, team 4 a weak one.
    scores = {1: 30, 2: 24, 3: 21, 4: 14}
    out: list[gm.GameResult] = []
    for i in range(n):
        home = (i % 4) + 1
        away = ((i + 1) % 4) + 1
        out.append(gm.GameResult(home, away, scores[home] + (i % 3), scores[away] + (i % 2)))
    return out


def test_normal_cdf_basics():
    assert gm.normal_cdf(0, 0, 1) == pytest.approx(0.5)
    assert gm.normal_cdf(1.96, 0, 1) == pytest.approx(0.975, abs=1e-3)
    assert gm.normal_cdf(5, 5, 0) == 1.0
    assert gm.normal_cdf(4, 5, 0) == 0.0


def test_league_scoring_requires_enough_games():
    assert gm.league_scoring(_results(gm.MIN_LEAGUE_GAMES - 1)) is None
    league = gm.league_scoring(_results())
    assert league is not None
    assert league.margin_sd > 0 and league.total_sd > 0 and league.team_sd > 0


def test_team_rating_splits_for_and_against():
    results = [gm.GameResult(1, 2, 27, 20), gm.GameResult(3, 1, 10, 17)]
    rating = gm.team_rating(results, 1)
    assert rating is not None
    assert rating.for_avg == pytest.approx(22.0)
    assert rating.against_avg == pytest.approx(15.0)
    assert rating.games == 2
    assert gm.team_rating(results, 99) is None


def test_projection_favours_stronger_team_and_regresses_small_samples():
    results = _results()
    league = gm.league_scoring(results)
    strong = gm.team_rating(results, 1)
    weak = gm.team_rating(results, 4)
    home, away = gm.project_points(strong, weak, league)
    assert home > away

    tiny = gm.TeamRating(for_avg=45.0, against_avg=3.0, games=1.0)
    shrunk_home, _ = gm.project_points(tiny, None, league)
    assert shrunk_home < 45.0
    assert shrunk_home == pytest.approx(
        league.home_avg * (gm._shrink(45.0, 1.0, league.team_avg, gm.PRIOR_GAMES) / league.team_avg), rel=1e-6
    )


def test_missing_ratings_fall_back_to_league_averages():
    league = gm.league_scoring(_results())
    home, away = gm.project_points(None, None, league)
    assert home == pytest.approx(league.home_avg)
    assert away == pytest.approx(league.away_avg)


def test_win_probabilities_sum_to_one_and_follow_margin():
    home, away = gm.win_probabilities(4.0, 13.0)
    assert home > away
    assert home + away == pytest.approx(1.0)

    even_home, even_away = gm.win_probabilities(0.0, 13.0)
    assert even_home == pytest.approx(even_away)


def test_probabilities_never_reach_zero_or_one():
    home, away = gm.win_probabilities(80.0, 5.0)
    assert home <= gm.PROB_CEIL and away >= gm.PROB_FLOOR


def test_margin_buckets_are_symmetric_when_even():
    for _, home, away in gm.margin_bucket_probs(0.0, 13.0):
        assert home == pytest.approx(away)


def test_margin_buckets_sum_to_the_win_probabilities():
    mean, sd = 3.0, 13.0
    buckets = gm.margin_bucket_probs(mean, sd)
    home_win, away_win = gm.win_probabilities(mean, sd)
    assert sum(h for _, h, _ in buckets) == pytest.approx(home_win, abs=1e-3)
    assert sum(a for _, _, a in buckets) == pytest.approx(away_win, abs=1e-3)


def test_over_under_complement_and_monotonic():
    rows = gm.over_under(45.0, 13.0, [38.5, 44.5, 50.5])
    for _, over, under in rows:
        assert over + under == pytest.approx(1.0)
    overs = [over for _, over, _ in rows]
    assert overs == sorted(overs, reverse=True)


def test_half_point_lines_are_half_points_around_center():
    lines = gm.half_point_lines(46.2)
    assert all(math.isclose(line % 1, 0.5) for line in lines)
    assert 46.5 in lines
    assert lines == sorted(lines)
    assert all(line > 0 for line in gm.half_point_lines(2.0))


def test_spread_cover_complements_and_favours_stronger_home():
    rows = gm.spread_cover(7.0, 13.0, [-10.5, -3.5, 3.5])
    for _, home, away in rows:
        assert home + away == pytest.approx(1.0)
    covers = {spread: home for spread, home, _ in rows}
    assert covers[-3.5] > covers[-10.5]
    assert covers[3.5] > covers[-3.5]
