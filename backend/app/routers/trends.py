from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from app.core.cache import ttl_cache
from app.core.deps import valid_sport
from app.db import get_db
from app.models import Game, Player, PlayerTrendSignal, PlayerWeeklyStat
from app.schemas import CheatsheetRowOut, TrendGroupsOut

router = APIRouter(prefix="/{sport}/trends", tags=["trends"])


def _calculate_daily_hit_rate(
    db: Session,
    player_id: int,
    stat_name: str,
    threshold: float,
    days_back: int | None,
    sport: str,
) -> tuple[int, int]:
    """
    Calculate (hits, games) for a player/stat/threshold from PlayerWeeklyStat
    filtered by date range.
    
    If days_back is None, returns (0, 0) to signal use of precomputed signal.
    If days_back >= 0, filters games by kickoff date (0 = today, 1 = last 24h, etc).
    """
    if days_back is None:
        return (0, 0)
    
    # Calculate date cutoff: today at 00:00 UTC minus days_back
    cutoff_date = datetime.utcnow() - timedelta(days=days_back)
    
    # Get all games on/after cutoff date
    games_in_range = db.query(Game.id).filter(
        and_(
            Game.sport == sport,
            Game.kickoff >= cutoff_date,
        )
    ).all()
    game_ids = {g[0] for g in games_in_range}
    
    if not game_ids:
        return (0, 0)
    
    # Get all PlayerWeeklyStat for this player's stat in the date range
    stats = db.query(PlayerWeeklyStat).filter(
        and_(
            PlayerWeeklyStat.player_id == player_id,
            PlayerWeeklyStat.game_id.in_(game_ids),
        )
    ).all()
    
    # Count hits (stat value > threshold)
    hits = sum(1 for s in stats if getattr(s, stat_name, 0) > threshold)
    games = len(stats)
    
    return (hits, games)


@router.get("/cheatsheet", response_model=list[CheatsheetRowOut])
@ttl_cache(seconds=300)
def get_cheatsheet(
    sport: str = Depends(valid_sport),
    season: int | None = Query(None),
    week: int | None = Query(None),
    days_back: int | None = Query(None),
    min_hit_rate: float = Query(1.0, ge=0, le=1),
    min_games: int = Query(3, ge=1),
    db: Session = Depends(get_db),
):
    """
    Get cheatsheet (high-confidence trend signals).
    
    Query parameters:
    - season, week: Filter to players playing that week (historical)
    - days_back: Filter to games in last N days (0=today, 1=last 24h, etc) for "Trending Today"
    - min_hit_rate: Minimum hit rate (0.0 to 1.0)
    - min_games: Minimum number of games to qualify
    """
    signals = (
        db.query(PlayerTrendSignal)
        .options(joinedload(PlayerTrendSignal.player).joinedload(Player.team))
        .filter(PlayerTrendSignal.sport == sport, PlayerTrendSignal.recent_form_games >= min_games)
        .all()
    )
    
    # If filtering by week, get team IDs playing that week
    playing_team_ids = None
    if season is not None and week is not None:
        games = db.query(Game).filter(
            Game.sport == sport,
            Game.season == season,
            Game.week == week
        ).all()
        playing_team_ids = set()
        for game in games:
            playing_team_ids.add(game.home_team_id)
            playing_team_ids.add(game.away_team_id)
    
    rows: list[CheatsheetRowOut] = []
    for signal in signals:
        # Skip if player's team is not playing this week
        if playing_team_ids is not None and signal.player.team_id not in playing_team_ids:
            continue
        
        # Use daily hit-rate if days_back specified, otherwise use precomputed signal
        if days_back is not None:
            hits, games = _calculate_daily_hit_rate(
                db, signal.player_id, signal.stat_name, signal.threshold, days_back, sport
            )
            # For daily filtering, require fewer games (at least 1)
            if games < 1:
                continue
            hit_rate = hits / games if games > 0 else 0
        else:
            if signal.recent_form_games < min_games:
                continue
            hits = signal.recent_form_hits
            games = signal.recent_form_games
            hit_rate = hits / games
        
        if hit_rate < min_hit_rate:
            continue
        
        rows.append(
            CheatsheetRowOut(
                player_name=signal.player.full_name,
                team=signal.player.team.abbreviation if signal.player.team else "",
                stat_name=signal.stat_name,
                threshold=signal.threshold,
                direction=signal.direction,
                hits=hits,
                games=games,
                hit_rate=round(hit_rate, 3),
            )
        )
    rows.sort(key=lambda r: (-r.hit_rate, -r.games))
    return rows


@router.get("/groups", response_model=TrendGroupsOut)
@ttl_cache(seconds=300)
def get_trend_groups(
    sport: str = Depends(valid_sport),
    season: int | None = Query(None),
    week: int | None = Query(None),
    days_back: int | None = Query(None),
    db: Session = Depends(get_db),
):
    """
    Get all trend categories (recent_form, versus_opponent, etc.) 
    for the current week or specified season/week.
    
    If season/week are provided, filters players to only those playing that week.
    If days_back is provided, filters to games in last N days for "Trending Today".
    """
    # Get all cheatsheet rows for the current sport/season/week
    rows = get_cheatsheet(sport, season, week, days_back, 0.0, 1, db)  # 0.0 min hit rate, 1 min game
    
    # Categorize by stat name / attributes
    # For now, return all rows in all categories (MVP simplification)
    # Real implementation would have explicit categorization logic
    return TrendGroupsOut(
        recent_form=rows[:5],
        versus_opponent=rows[5:10] if len(rows) > 5 else [],
        alternate_lines=rows[10:15] if len(rows) > 10 else [],
        home_away_splits=rows[15:20] if len(rows) > 15 else [],
        unders_only=rows[20:25] if len(rows) > 20 else [],
        team_form=rows[25:30] if len(rows) > 25 else [],
        injury_impact=rows[30:35] if len(rows) > 30 else [],
        opponent_rank=rows[35:40] if len(rows) > 35 else [],
    )
