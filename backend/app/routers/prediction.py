"""Statistical game outlook endpoint — model probabilities plus real market prices for reference."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.deps import valid_sport
from ..core.prediction_service import build_prediction
from ..db import get_db
from ..models import Game, OddsEvent, OddsLine
from ..schemas import GamePredictionOut, MarketReferenceOut
from .matchup import _moneyline_market, _spread_market, _total_market

router = APIRouter(prefix="/{sport}/games", tags=["prediction"])


def _market_reference(db: Session, game: Game) -> MarketReferenceOut | None:
    odds_event = db.query(OddsEvent).filter(OddsEvent.game_id == game.id).one_or_none()
    if odds_event is None:
        return None
    lines = db.query(OddsLine).filter(OddsLine.odds_event_id == odds_event.id).all()
    if not lines:
        return None

    moneyline = _moneyline_market(lines, game.home_team.name, game.away_team.name)
    spread = _spread_market(lines, game.home_team.name, game.away_team.name)
    total = _total_market(lines)
    return MarketReferenceOut(
        home_win=moneyline.home.fair_prob if moneyline and moneyline.home else None,
        away_win=moneyline.away.fair_prob if moneyline and moneyline.away else None,
        total_point=total.point if total else None,
        total_over=total.over.fair_prob if total and total.over else None,
        spread_point=spread.point if spread else None,
    )


@router.get("/{game_id}/prediction", response_model=GamePredictionOut)
def get_game_prediction(game_id: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id, Game.sport == sport).one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    market = _market_reference(db, game)
    prediction = build_prediction(
        db,
        sport,
        game_id,
        market.total_point if market else None,
        market.spread_point if market else None,
    )
    if prediction is None:
        raise HTTPException(status_code=404, detail="Game not found")
    return prediction.model_copy(update={"market": market})
