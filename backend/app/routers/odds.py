from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import valid_sport
from app.core.cache import ttl_cache
from app.db import get_db
from app.models import OddsEvent, OddsLine
from app.schemas import OddsLineOut

router = APIRouter(prefix="/{sport}/odds", tags=["odds"])


@router.get("/sample", response_model=list[float])
@ttl_cache(seconds=3600)
def get_sample_prices(sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    """Return real odds prices from the last 50 games for frontend to use instead of mock rotations."""
    lines = (
        db.query(OddsLine.price)
        .join(OddsEvent)
        .filter(OddsEvent.id.in_(
            db.query(OddsEvent.id)
            .order_by(OddsEvent.fetched_at.desc())
            .limit(50)
        ))
        .all()
    )
    
    # Extract prices, filter duplicates, and return sorted list
    prices = sorted(list(set(float(p[0]) for p in lines if p[0])))
    return prices[:20]  # Return top 20 unique prices


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
