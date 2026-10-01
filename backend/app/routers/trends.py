"""Trends/cheatsheet route handlers — business logic lives in trends_service.py,
batch-fetch helpers in trends_queries.py (see SOLID audit notes on file size
and layering)."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..core.cache import ttl_cache
from ..core.constants import CACHE_TTL_MEDIUM
from ..core.deps import valid_sport
from ..db import get_db
from ..schemas import CheatsheetRowOut, TrendGroupsOut
from .trends_service import _get_cheatsheet_internal, build_trend_groups, get_player_signal_rows

router = APIRouter(prefix="/{sport}/trends", tags=["trends"])

__all__ = ["router", "get_player_signal_rows"]


@router.get("/cheatsheet", response_model=list[CheatsheetRowOut])
@ttl_cache(seconds=CACHE_TTL_MEDIUM)
def get_cheatsheet(
    sport: str = Depends(valid_sport),
    season: int | None = Query(None),
    week: int | None = Query(None),
    days_back: int | None = Query(None),
    min_hit_rate: float = Query(1.0, ge=0, le=1),
    min_games: int = Query(3, ge=0),
    db: Session = Depends(get_db),
):
    """
    Get cheatsheet (high-confidence trend signals).
    """
    return _get_cheatsheet_internal(sport, season, week, days_back, min_hit_rate, min_games, db)


@router.get("/groups", response_model=TrendGroupsOut)
@ttl_cache(seconds=CACHE_TTL_MEDIUM)
def get_trend_groups(
    sport: str = Depends(valid_sport),
    season: int | None = Query(None),
    week: int | None = Query(None),
    days_back: int | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Get all trend categories grouped by signal type (Linemate-style cheatsheets).

    Filters to props hitting 100% of the time.
    Returns 8 categories: Recent Form, Versus Opponent, Home/Away Splits,
    Alternate Lines, 1st Quarter, Team Form, Unders Only, Injury Impact.
    """
    # Get all high-confidence cheatsheet rows (60%+ hit rate with min 2 games)
    rows = _get_cheatsheet_internal(
        sport=sport,
        season=season,
        week=week,
        days_back=days_back,
        min_hit_rate=0.6,
        min_games=2,
        db=db,
    )
    return build_trend_groups(rows)
