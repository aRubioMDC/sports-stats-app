from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..core.deps import valid_sport
from ..db import get_db
from ..models import Player, PlayerTrendSignal
from ..schemas import PlayerTrendOut, TrendSignalOut

router = APIRouter(prefix="/{sport}/players", tags=["players"])


@router.get("/{player_id}/trends", response_model=list[PlayerTrendOut])
def get_player_trends(player_id: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id, Player.sport == sport).one_or_none()
    if player is None:
        raise HTTPException(status_code=404, detail="Player not found")

    signals = db.query(PlayerTrendSignal).filter(PlayerTrendSignal.player_id == player_id).all()
    results: list[PlayerTrendOut] = []
    for signal in signals:
        trend_signals = []
        if signal.recent_form_games:
            trend_signals.append(
                TrendSignalOut(
                    label="Recent Form",
                    hits=signal.recent_form_hits,
                    games=signal.recent_form_games,
                    hit_rate=round(signal.recent_form_hits / signal.recent_form_games, 3),
                )
            )
        if signal.h2h_games:
            trend_signals.append(
                TrendSignalOut(
                    label="Head to Head",
                    hits=signal.h2h_hits,
                    games=signal.h2h_games,
                    hit_rate=round(signal.h2h_hits / signal.h2h_games, 3),
                )
            )
        results.append(
            PlayerTrendOut(
                player_id=player.id,
                player_name=player.full_name,
                team=player.team.abbreviation if player.team else "",
                stat_name=signal.stat_name,
                threshold=signal.threshold,
                direction=signal.direction,
                window_mode=signal.window_mode,
                signals=trend_signals,
            )
        )
    return results
