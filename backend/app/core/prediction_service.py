"""Builds the statistical outlook for one game from real final scores (see game_model for the math)."""

from __future__ import annotations

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..models import Game
from ..schemas import (
    GamePredictionOut,
    MarginBucketOut,
    OverUnderLineOut,
    SpreadLineOut,
    WinProbabilityOut,
)
from . import game_model as gm
from .cache import ttl_cache
from .constants import CACHE_TTL_MEDIUM
from .sport_registry import get_sport

# NFL only for now; other sports fall back to the market-odds panel until their model exists.
MODELLED_SPORTS = {"nfl"}
PREVIOUS_SEASON_WEIGHT = 0.5


def _load_results(db: Session, sport: str, game: Game) -> list[gm.GameResult]:
    """Real finals from the current and previous season that happened before this game."""
    previous_season = get_sport(sport).previous_season(game.season)
    query = db.query(Game).filter(
        Game.sport == sport,
        Game.status == "final",
        Game.season.in_([previous_season, game.season]),
        Game.id != game.id,
        Game.home_score.isnot(None),
        Game.away_score.isnot(None),
    )
    if game.kickoff is not None:
        query = query.filter(or_(Game.kickoff.is_(None), Game.kickoff < game.kickoff))

    return [
        gm.GameResult(
            home_id=g.home_team_id,
            away_id=g.away_team_id,
            home_score=g.home_score,
            away_score=g.away_score,
            weight=1.0 if g.season == game.season else PREVIOUS_SEASON_WEIGHT,
        )
        for g in query.all()
    ]


def _with_extra_line(lines: list[float], extra: float | None) -> list[float]:
    merged = set(lines)
    if extra is not None:
        merged.add(extra)
    return sorted(merged)


def _line_out(rows: list[tuple[float, float, float]]) -> list[OverUnderLineOut]:
    return [OverUnderLineOut(line=line, over=round(over, 3), under=round(under, 3)) for line, over, under in rows]


@ttl_cache(CACHE_TTL_MEDIUM)
def build_prediction(
    db: Session,
    sport: str,
    game_id: int,
    market_total_point: float | None = None,
    market_spread_point: float | None = None,
) -> GamePredictionOut | None:
    """None when the game does not exist. Market points only add comparison lines to the output."""
    game = db.query(Game).filter(Game.id == game_id, Game.sport == sport).one_or_none()
    if game is None:
        return None
    if sport not in MODELLED_SPORTS:
        return GamePredictionOut(available=False, reason="The statistical model is not available for this sport yet.")

    results = _load_results(db, sport, game)
    league = gm.league_scoring(results)
    if league is None:
        return GamePredictionOut(available=False, reason="Not enough completed games yet to build a reliable model.")

    home = gm.team_rating(results, game.home_team_id)
    away = gm.team_rating(results, game.away_team_id)
    mu_home, mu_away = gm.project_points(home, away, league)
    mean_margin = mu_home - mu_away
    mean_total = mu_home + mu_away

    win_home, win_away = gm.win_probabilities(mean_margin, league.margin_sd)
    home_games = home.games if home else 0.0
    away_games = away.games if away else 0.0

    total_lines = _with_extra_line(gm.half_point_lines(mean_total), market_total_point)
    spread_lines = _with_extra_line(gm.SPREAD_HOME_LINES, market_spread_point)

    return GamePredictionOut(
        available=True,
        model="attack-defense ratings with normal margin/total",
        projected_home=round(mu_home, 1),
        projected_away=round(mu_away, 1),
        projected_total=round(mean_total, 1),
        league_games=round(league.games, 1),
        home_games=round(home_games, 1),
        away_games=round(away_games, 1),
        low_sample=min(home_games, away_games) < gm.LOW_SAMPLE_TEAM_GAMES,
        win=WinProbabilityOut(home=round(win_home, 3), away=round(win_away, 3)),
        margin_buckets=[
            MarginBucketOut(label=label, home=round(h, 3), away=round(a, 3))
            for label, h, a in gm.margin_bucket_probs(mean_margin, league.margin_sd)
        ],
        totals=_line_out(gm.over_under(mean_total, league.total_sd, total_lines)),
        home_team_totals=_line_out(gm.over_under(mu_home, league.team_sd, gm.half_point_lines(mu_home))),
        away_team_totals=_line_out(gm.over_under(mu_away, league.team_sd, gm.half_point_lines(mu_away))),
        spreads=[
            SpreadLineOut(home_line=spread, home_cover=round(h, 3), away_cover=round(a, 3))
            for spread, h, a in gm.spread_cover(mean_margin, league.margin_sd, spread_lines)
        ],
    )
