from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import valid_sport
from app.db import get_db
from app.models import Game
from app.schemas import GameOut

router = APIRouter(prefix="/{sport}/games", tags=["games"])


@router.get("", response_model=list[GameOut])
def list_games(season: int, week: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    games = (
        db.query(Game)
        .filter(Game.sport == sport, Game.season == season, Game.week == week)
        .order_by(Game.kickoff)
        .all()
    )
    return [
        GameOut(
            id=g.id,
            season=g.season,
            week=g.week,
            kickoff=g.kickoff.isoformat() if g.kickoff else None,
            home_team=g.home_team,
            away_team=g.away_team,
            home_score=g.home_score,
            away_score=g.away_score,
            status=g.status,
        )
        for g in games
    ]


@router.get("/{game_id}", response_model=GameOut)
def get_game(game_id: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id, Game.sport == sport).one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
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

