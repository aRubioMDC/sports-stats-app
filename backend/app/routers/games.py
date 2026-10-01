from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.deps import valid_sport
from ..core.query_helpers import filter_by_sport_week, game_to_schema
from ..db import get_db
from ..models import Game
from ..schemas import GameOut

router = APIRouter(prefix="/{sport}/games", tags=["games"])


@router.get("", response_model=list[GameOut])
def list_games(season: int, week: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    games = filter_by_sport_week(db.query(Game), sport, season, week).order_by(Game.kickoff).all()
    return [game_to_schema(g) for g in games]


@router.get("/{game_id}", response_model=GameOut)
def get_game(game_id: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id, Game.sport == sport).one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return game_to_schema(game)

