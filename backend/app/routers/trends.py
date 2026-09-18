from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload

from app.core.deps import valid_sport
from app.db import get_db
from app.models import Player, PlayerTrendSignal
from app.schemas import CheatsheetRowOut

router = APIRouter(prefix="/{sport}/trends", tags=["trends"])


@router.get("/cheatsheet", response_model=list[CheatsheetRowOut])
def get_cheatsheet(
    sport: str = Depends(valid_sport),
    min_hit_rate: float = Query(1.0, ge=0, le=1),
    min_games: int = Query(3, ge=1),
    db: Session = Depends(get_db),
):
    signals = (
        db.query(PlayerTrendSignal)
        .options(joinedload(PlayerTrendSignal.player).joinedload(Player.team))
        .filter(PlayerTrendSignal.sport == sport, PlayerTrendSignal.recent_form_games >= min_games)
        .all()
    )
    rows: list[CheatsheetRowOut] = []
    for signal in signals:
        hit_rate = signal.recent_form_hits / signal.recent_form_games
        if hit_rate < min_hit_rate:
            continue
        rows.append(
            CheatsheetRowOut(
                player_name=signal.player.full_name,
                team=signal.player.team.abbreviation if signal.player.team else "",
                stat_name=signal.stat_name,
                threshold=signal.threshold,
                direction=signal.direction,
                hits=signal.recent_form_hits,
                games=signal.recent_form_games,
                hit_rate=round(hit_rate, 3),
            )
        )
    rows.sort(key=lambda r: (-r.hit_rate, -r.games))
    return rows
