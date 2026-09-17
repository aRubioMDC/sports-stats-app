"""Matchup context endpoint — the ValueStats-style comparison card + H2H history."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import valid_sport
from app.core.sport_registry import get_sport
from app.db import get_db
from app.models import Game, TeamSeasonStats
from app.schemas import GameOut, HeadToHeadResult, MatchupContextOut, StatRow

router = APIRouter(prefix="/{sport}/games", tags=["matchup"])


def _format_time_of_possession(seconds: float) -> float:
    return round(seconds, 0)


@router.get("/{game_id}/matchup", response_model=MatchupContextOut)
def get_matchup_context(game_id: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id, Game.sport == sport).one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    home_stats = (
        db.query(TeamSeasonStats)
        .filter(
            TeamSeasonStats.sport == sport,
            TeamSeasonStats.team_id == game.home_team_id,
            TeamSeasonStats.season == game.season,
        )
        .one_or_none()
    )
    away_stats = (
        db.query(TeamSeasonStats)
        .filter(
            TeamSeasonStats.sport == sport,
            TeamSeasonStats.team_id == game.away_team_id,
            TeamSeasonStats.season == game.season,
        )
        .one_or_none()
    )

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
            home_team=g.home_team.abbreviation,
            away_team=g.away_team.abbreviation,
            home_score=g.home_score or 0,
            away_score=g.away_score or 0,
        )
        for g in h2h_games
    ]

    return MatchupContextOut(
        game=GameOut(
            id=game.id,
            season=game.season,
            week=game.week,
            kickoff=game.kickoff.isoformat() if game.kickoff else None,
            home_team=game.home_team,
            away_team=game.away_team,
            home_score=game.home_score,
            away_score=game.away_score,
            status=game.status,
        ),
        window_mode=home_stats.window_mode if home_stats else "current",
        stat_rows=stat_rows,
        head_to_head=head_to_head,
    )
