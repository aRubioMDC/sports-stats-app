"""Builds the statistical outlook for one game from real final scores (see game_model for the math)."""

from __future__ import annotations

from dataclasses import dataclass

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
from . import hockey_model as hm
from .cache import ttl_cache
from .constants import CACHE_TTL_MEDIUM
from .sport_registry import get_sport

# Sports with a statistical model; others fall back to the market-odds panel.
MODELLED_SPORTS = {"nfl", "nhl"}
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


def _hockey_prediction(
    mu_home: float,
    mu_away: float,
    games: tuple[float, float, float],
    market_total_point: float | None,
    market_spread_point: float | None,
) -> GamePredictionOut:
    league_games, home_games, away_games = games
    mean_total = mu_home + mu_away
    dist = hm.final_margin_distribution(mu_home, mu_away)
    win_home, win_away = hm.win_probabilities(dist)
    total_lines = _with_extra_line(hm.total_lines(mean_total), market_total_point)
    spread_lines = _with_extra_line(hm.PUCK_HOME_LINES, market_spread_point)

    return GamePredictionOut(
        available=True,
        model="attack-defense ratings with Poisson goals",
        projected_home=round(mu_home, 1),
        projected_away=round(mu_away, 1),
        projected_total=round(mean_total, 1),
        league_games=round(league_games, 1),
        home_games=round(home_games, 1),
        away_games=round(away_games, 1),
        low_sample=min(home_games, away_games) < hm.LOW_SAMPLE_TEAM_GAMES,
        win=WinProbabilityOut(home=round(win_home, 3), away=round(win_away, 3)),
        margin_buckets=[
            MarginBucketOut(label=label, home=round(h, 3), away=round(a, 3))
            for label, h, a in hm.margin_bucket_probs(dist)
        ],
        totals=_line_out(hm.over_under(mean_total, total_lines)),
        home_team_totals=_line_out(hm.over_under(mu_home, hm.team_lines(mu_home))),
        away_team_totals=_line_out(hm.over_under(mu_away, hm.team_lines(mu_away))),
        spreads=[
            SpreadLineOut(home_line=line, home_cover=round(h, 3), away_cover=round(a, 3))
            for line, h, a in hm.spread_cover(dist, spread_lines)
        ],
    )


@dataclass(frozen=True)
class GameProjection:
    """Expected scoring for one matchup plus the ratings behind it."""

    sport: str
    league: gm.LeagueScoring
    home: gm.TeamRating | None
    away: gm.TeamRating | None
    mu_home: float
    mu_away: float

    @property
    def home_win_probability(self) -> float:
        """Unrounded model probability that the home team wins."""
        if self.sport == "nhl":
            return hm.win_probabilities(hm.final_margin_distribution(self.mu_home, self.mu_away))[0]
        return gm.win_probabilities(self.mu_home - self.mu_away, self.league.margin_sd)[0]

    def over_probability(self, line: float) -> float:
        """Unrounded model probability that the combined score finishes above `line`."""
        mean_total = self.mu_home + self.mu_away
        if self.sport == "nhl":
            return hm.over_under(mean_total, [line])[0][1]
        return gm.over_under(mean_total, self.league.total_sd, [line])[0][1]


def project_game(sport: str, results: list[gm.GameResult], home_id: int, away_id: int) -> GameProjection | None:
    """Pure model step (no DB): None when there are too few results for a league baseline."""
    league = gm.league_scoring(results)
    if league is None:
        return None
    home = gm.team_rating(results, home_id)
    away = gm.team_rating(results, away_id)
    if sport == "nhl":
        mu_home, mu_away = gm.project_points(home, away, league, prior_games=hm.PRIOR_GAMES)
    else:
        mu_home, mu_away = gm.project_points(home, away, league)
    return GameProjection(sport, league, home, away, mu_home, mu_away)


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
    projection = project_game(sport, results, game.home_team_id, game.away_team_id)
    if projection is None:
        return GamePredictionOut(available=False, reason="Not enough completed games yet to build a reliable model.")

    league = projection.league
    mu_home, mu_away = projection.mu_home, projection.mu_away
    home_games = projection.home.games if projection.home else 0.0
    away_games = projection.away.games if projection.away else 0.0

    if sport == "nhl":
        return _hockey_prediction(
            mu_home,
            mu_away,
            (league.games, home_games, away_games),
            market_total_point,
            market_spread_point,
        )

    mean_margin = mu_home - mu_away
    mean_total = mu_home + mu_away

    win_home, win_away = gm.win_probabilities(mean_margin, league.margin_sd)

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
