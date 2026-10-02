"""Matchup context endpoint — the ValueStats-style comparison card + H2H history."""

from collections import Counter

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.betting_math import american_to_implied_prob
from ..core.deps import valid_sport
from ..core.query_helpers import game_result_for_team, game_to_schema, serialize_kickoff
from ..core.sport_registry import get_sport
from ..db import get_db
from ..models import Game, OddsEvent, OddsLine, Team, TeamSeasonStats
from app.schemas import (
    HeadToHeadResult,
    MatchupContextOut,
    MoneylineMarketOut,
    OddsSideOut,
    RecentGameOut,
    SpreadMarketOut,
    StandingsRowOut,
    StatRow,
    TotalMarketOut,
)

router = APIRouter(prefix="/{sport}/games", tags=["matchup"])


def _format_time_of_possession(seconds: float) -> float:
    return round(seconds, 0)


def _mode_point(lines: list[OddsLine]) -> float | None:
    points = [line.point for line in lines if line.point is not None]
    if not points:
        return None
    return Counter(points).most_common(1)[0][0]


def _moneyline_market(lines: list[OddsLine], home_name: str, away_name: str) -> MoneylineMarketOut | None:
    home_lines = [l for l in lines if l.market == "h2h" and l.outcome_name == home_name]
    away_lines = [l for l in lines if l.market == "h2h" and l.outcome_name == away_name]
    if not home_lines or not away_lines:
        return None
    home_best = max(home_lines, key=lambda l: l.price)
    away_best = max(away_lines, key=lambda l: l.price)
    home_raw = sum(american_to_implied_prob(l.price) for l in home_lines) / len(home_lines)
    away_raw = sum(american_to_implied_prob(l.price) for l in away_lines) / len(away_lines)
    total_raw = home_raw + away_raw
    return MoneylineMarketOut(
        home=OddsSideOut(
            best_price=home_best.price,
            best_bookmaker=home_best.bookmaker,
            fair_prob=round(home_raw / total_raw, 3) if total_raw else None,
        ),
        away=OddsSideOut(
            best_price=away_best.price,
            best_bookmaker=away_best.bookmaker,
            fair_prob=round(away_raw / total_raw, 3) if total_raw else None,
        ),
    )


def _spread_market(lines: list[OddsLine], home_name: str, away_name: str) -> SpreadMarketOut | None:
    home_all = [l for l in lines if l.market == "spreads" and l.outcome_name == home_name]
    point = _mode_point(home_all)
    if point is None:
        return None
    home_lines = [l for l in home_all if l.point == point]
    away_lines = [l for l in lines if l.market == "spreads" and l.outcome_name == away_name and l.point == -point]
    if not home_lines or not away_lines:
        return None
    home_best = max(home_lines, key=lambda l: l.price)
    away_best = max(away_lines, key=lambda l: l.price)
    return SpreadMarketOut(
        point=point,
        home=OddsSideOut(best_price=home_best.price, best_bookmaker=home_best.bookmaker),
        away=OddsSideOut(best_price=away_best.price, best_bookmaker=away_best.bookmaker),
    )


def _total_market(lines: list[OddsLine]) -> TotalMarketOut | None:
    over_all = [l for l in lines if l.market == "totals" and l.outcome_name == "Over"]
    point = _mode_point(over_all)
    if point is None:
        return None
    over_lines = [l for l in over_all if l.point == point]
    under_lines = [l for l in lines if l.market == "totals" and l.outcome_name == "Under" and l.point == point]
    if not over_lines or not under_lines:
        return None
    over_best = max(over_lines, key=lambda l: l.price)
    under_best = max(under_lines, key=lambda l: l.price)
    over_raw = sum(american_to_implied_prob(l.price) for l in over_lines) / len(over_lines)
    under_raw = sum(american_to_implied_prob(l.price) for l in under_lines) / len(under_lines)
    total_raw = over_raw + under_raw
    return TotalMarketOut(
        point=point,
        over=OddsSideOut(
            best_price=over_best.price,
            best_bookmaker=over_best.bookmaker,
            fair_prob=round(over_raw / total_raw, 3) if total_raw else None,
        ),
        under=OddsSideOut(
            best_price=under_best.price,
            best_bookmaker=under_best.bookmaker,
            fair_prob=round(under_raw / total_raw, 3) if total_raw else None,
        ),
    )


def _division_standings(db: Session, sport: str, season: int, division: str, game_team_ids: set[int]) -> list[StandingsRowOut]:
    if not division:
        return []
    rows: list[StandingsRowOut] = []
    for team in db.query(Team).filter(Team.sport == sport, Team.division == division):
        finals = (
            db.query(Game)
            .filter(
                Game.sport == sport,
                Game.season == season,
                Game.status == "final",
                (Game.home_team_id == team.id) | (Game.away_team_id == team.id),
            )
            .all()
        )
        wins = losses = ties = 0
        for g in finals:
            _, _, result = game_result_for_team(g, team.id)
            if result == "W":
                wins += 1
            elif result == "L":
                losses += 1
            else:
                ties += 1
        total = wins + losses + ties
        pct = (wins + 0.5 * ties) / total if total else 0.0
        rows.append(
            StandingsRowOut(
                team=team.abbreviation,
                logo_url=team.logo_url,
                primary_color=team.primary_color,
                wins=wins,
                losses=losses,
                ties=ties,
                pct=round(pct, 3),
                is_in_game=team.id in game_team_ids,
            )
        )
    rows.sort(key=lambda r: -r.pct)
    return rows


def _recent_games(db: Session, sport: str, team_id: int, exclude_game_id: int, limit: int = 5) -> list[RecentGameOut]:
    games = (
        db.query(Game)
        .filter(
            Game.sport == sport,
            Game.status == "final",
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
            Game.id != exclude_game_id,
        )
        .order_by(Game.season.desc(), Game.week.desc())
        .limit(limit)
        .all()
    )
    out: list[RecentGameOut] = []
    for g in games:
        is_home = g.home_team_id == team_id
        team_score, opponent_score, result = game_result_for_team(g, team_id)
        opponent = g.away_team if is_home else g.home_team
        out.append(
            RecentGameOut(
                season=g.season,
                week=g.week,
                kickoff=serialize_kickoff(g.kickoff),
                opponent=opponent.abbreviation,
                opponent_logo_url=opponent.logo_url,
                is_home=is_home,
                result=result,
                team_score=team_score,
                opponent_score=opponent_score,
            )
        )
    return out


@router.get("/{game_id}/matchup", response_model=MatchupContextOut)
def get_matchup_context(game_id: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id, Game.sport == sport).one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    previous_season = get_sport(sport).previous_season(game.season)

    def _resolve_team_stats(team_id: int) -> tuple[TeamSeasonStats | None, bool]:
        current = (
            db.query(TeamSeasonStats)
            .filter(
                TeamSeasonStats.sport == sport,
                TeamSeasonStats.team_id == team_id,
                TeamSeasonStats.season == game.season,
            )
            .one_or_none()
        )
        if current is not None:
            return current, False
        previous = (
            db.query(TeamSeasonStats)
            .filter(
                TeamSeasonStats.sport == sport,
                TeamSeasonStats.team_id == team_id,
                TeamSeasonStats.season == previous_season,
            )
            .one_or_none()
        )
        return previous, previous is not None

    home_stats, home_used_previous = _resolve_team_stats(game.home_team_id)
    away_stats, away_used_previous = _resolve_team_stats(game.away_team_id)

    stat_rows: list[StatRow] = []
    if home_stats and away_stats:
        for label, value_field, rank_field in get_sport(sport).matchup_stat_rows():
            home_value = getattr(home_stats, value_field)
            away_value = getattr(away_stats, value_field)
            leader = "home" if home_value > away_value else ("away" if away_value > home_value else "tie")
            stat_rows.append(
                StatRow(
                    label=label,
                    home_value=round(home_value, 1),
                    home_rank=getattr(home_stats, rank_field),
                    away_value=round(away_value, 1),
                    away_rank=getattr(away_stats, rank_field),
                    leader=leader,
                )
            )

    h2h_games = (
        db.query(Game)
        .filter(
            Game.sport == sport,
            Game.status == "final",
            (
                ((Game.home_team_id == game.home_team_id) & (Game.away_team_id == game.away_team_id))
                | ((Game.home_team_id == game.away_team_id) & (Game.away_team_id == game.home_team_id))
            ),
            Game.id != game.id,
        )
        .order_by(Game.season.desc(), Game.week.desc())
        .limit(5)
        .all()
    )
    head_to_head = [
        HeadToHeadResult(
            season=g.season,
            week=g.week,
            kickoff=serialize_kickoff(g.kickoff),
            home_team=g.home_team.abbreviation,
            away_team=g.away_team.abbreviation,
            home_score=g.home_score or 0,
            away_score=g.away_score or 0,
        )
        for g in h2h_games
    ]

    odds_event = db.query(OddsEvent).filter(OddsEvent.game_id == game.id).one_or_none()
    odds_lines = db.query(OddsLine).filter(OddsLine.odds_event_id == odds_event.id).all() if odds_event else []
    moneyline = _moneyline_market(odds_lines, game.home_team.name, game.away_team.name) if odds_lines else None
    spread = _spread_market(odds_lines, game.home_team.name, game.away_team.name) if odds_lines else None
    total = _total_market(odds_lines) if odds_lines else None

    game_team_ids = {game.home_team_id, game.away_team_id}
    standings = _division_standings(db, sport, game.season, game.home_team.division, game_team_ids)
    home_recent_games = _recent_games(db, sport, game.home_team_id, game.id)
    away_recent_games = _recent_games(db, sport, game.away_team_id, game.id)

    return MatchupContextOut(
        game=game_to_schema(game),
        window_mode=("blended" if (home_used_previous or away_used_previous) else (home_stats.window_mode if home_stats else "current")),
        stat_rows=stat_rows,
        head_to_head=head_to_head,
        moneyline=moneyline,
        spread=spread,
        total=total,
        division=game.home_team.division or None,
        standings=standings,
        home_recent_games=home_recent_games,
        away_recent_games=away_recent_games,
    )

