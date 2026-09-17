from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import valid_sport
from app.db import get_db
from app.models import OddsEvent, OddsLine
from app.schemas import OddsLineOut

router = APIRouter(prefix="/{sport}/odds", tags=["odds"])


@router.get("/{game_id}", response_model=list[OddsLineOut])
def get_odds(game_id: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    odds_event = db.query(OddsEvent).filter(OddsEvent.game_id == game_id).one_or_none()
    if odds_event is None:
        return []
    lines = db.query(OddsLine).filter(OddsLine.odds_event_id == odds_event.id).all()
    return [
        OddsLineOut(
            bookmaker=line.bookmaker,
            market=line.market,
            outcome_name=line.outcome_name,
            price=line.price,
            point=line.point,
        )
        for line in lines
    ]
