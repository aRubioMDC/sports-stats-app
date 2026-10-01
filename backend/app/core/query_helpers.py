"""Shared query/response helpers to remove duplication across routers.

Extracted from repeated inline code in games.py, board.py, and matchup.py —
see the SOLID audit notes on DRY violations for the before/after.
"""

from sqlalchemy.orm import Query, Session

from ..models import Game
from ..schemas import GameOut


def filter_by_sport_week(query: Query, sport: str, season: int, week: int) -> Query:
    """Apply the (sport, season, week) filter repeated across games/board/trends routers."""
    return query.filter(Game.sport == sport, Game.season == season, Game.week == week)


def game_to_schema(game: Game) -> GameOut:
    """Convert a Game model to its response schema — same mapping repeated in
    games.py, board.py, and matchup.py."""
    return GameOut(
        id=game.id,
        season=game.season,
        week=game.week,
        kickoff=game.kickoff.isoformat() if game.kickoff else None,
        home_team=game.home_team,
        away_team=game.away_team,
        home_score=game.home_score,
        away_score=game.away_score,
        status=game.status,
    )


def game_result_for_team(game: Game, team_id: int) -> tuple[int, int, str]:
    """Return (team_score, opponent_score, result) for a team's perspective of a
    finished game — the W/L/T computation repeated in board.py's team-form
    calculation and matchup.py's recent-games/standings calculations."""
    is_home = game.home_team_id == team_id
    team_score = (game.home_score if is_home else game.away_score) or 0
    opponent_score = (game.away_score if is_home else game.home_score) or 0
    result = "W" if team_score > opponent_score else ("L" if team_score < opponent_score else "T")
    return team_score, opponent_score, result


def find_best_threshold(
    values: list[float], thresholds: list[float], min_count: int
) -> tuple[float, int, float] | None:
    """Find the threshold with the highest hit rate among `values`.

    Returns (hit_rate, hits, threshold), or None if fewer than `min_count` values.
    Generalizes the identical loop previously duplicated in board.py's
    _team_points_trend and _game_total_trend.
    """
    if len(values) < min_count:
        return None
    best: tuple[float, int, float] | None = None
    for threshold in thresholds:
        hits = sum(1 for v in values if v > threshold)
        rate = hits / len(values)
        if best is None or rate > best[0]:
            best = (rate, hits, threshold)
    return best
