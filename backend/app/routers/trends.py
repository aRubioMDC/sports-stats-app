from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

from ..core.cache import ttl_cache
from ..core.deps import valid_sport
from ..core.betting_math import american_to_implied_prob, devig_two_way
from ..core.stats_math import wilson_interval
from ..db import get_db
from ..etl.ingest_odds import STAT_TO_PLAYER_MARKET
from ..models import Game, Player, PlayerPropOdds, PlayerTrendSignal, PlayerWeeklyStat, Team, TeamSeasonStats
from ..schemas import CheatsheetRowOut, TrendGroupsOut

router = APIRouter(prefix="/{sport}/trends", tags=["trends"])


def _batch_calculate_opponent_ranks(
    db: Session,
    lookups: set[tuple[int, int]],  # (opponent_team_id, season)
) -> dict[tuple[int, int], int | None]:
    """
    Batch version of the defensive-rank lookup — one query for every (team, season)
    pair needed instead of one query per row (was the main N+1 bottleneck).
    """
    if not lookups:
        return {}

    team_ids = {team_id for team_id, _ in lookups}
    seasons = {season for _, season in lookups}
    stats = (
        db.query(TeamSeasonStats)
        .filter(TeamSeasonStats.team_id.in_(team_ids), TeamSeasonStats.season.in_(seasons))
        .all()
    )
    stats_by_key = {(s.team_id, s.season): s for s in stats}

    result: dict[tuple[int, int], int | None] = {}
    for key in lookups:
        s = stats_by_key.get(key)
        if s and s.points_per_game_rank > 0 and s.yards_per_game_rank > 0:
            avg_rank = round((s.points_per_game_rank + s.yards_per_game_rank) / 2)
            result[key] = max(1, min(32, avg_rank))
        else:
            result[key] = None
    return result


def _batch_fetch_player_logs(db: Session, player_ids: set[int]) -> dict[int, list[PlayerWeeklyStat]]:
    """
    One query for every player's full game log, ordered most-recent-first.

    Reused by the live home/away-split and head-to-head calculations below —
    those need the *specific* upcoming opponent/venue, so they can't be
    precomputed by the ETL; computing them here from data already fetched
    costs no extra round-trips.
    """
    if not player_ids:
        return {}
    all_stats = (
        db.query(PlayerWeeklyStat)
        .filter(PlayerWeeklyStat.player_id.in_(player_ids))
        .order_by(PlayerWeeklyStat.player_id, PlayerWeeklyStat.season.desc(), PlayerWeeklyStat.week.desc())
        .all()
    )
    stats_by_player: dict[int, list[PlayerWeeklyStat]] = {}
    for s in all_stats:
        stats_by_player.setdefault(s.player_id, []).append(s)
    return stats_by_player


def _home_away_split_rate(
    logs: list[PlayerWeeklyStat], stat_name: str, threshold: float, is_home: bool | None, min_season: int
) -> tuple[int, int]:
    """Hit rate restricted to past games in the same home/away context as the upcoming game."""
    if is_home is None:
        return (0, 0)
    matching = [s for s in logs if s.is_home == is_home and s.season >= min_season]
    return (sum(1 for s in matching if getattr(s, stat_name, 0) > threshold), len(matching))


def _head_to_head_rate(
    logs: list[PlayerWeeklyStat], stat_name: str, threshold: float, opponent_team_id: int | None, min_season: int
) -> tuple[int, int]:
    """Hit rate restricted to past meetings against the upcoming opponent."""
    if opponent_team_id is None:
        return (0, 0)
    matching = [s for s in logs if s.opponent_team_id == opponent_team_id and s.season >= min_season]
    return (sum(1 for s in matching if getattr(s, stat_name, 0) > threshold), len(matching))


def _batch_fetch_team_abbreviations(db: Session, team_ids: set[int]) -> dict[int, str]:
    """One query for every opponent's abbreviation, for the "{TEAM} is a good matchup" copy."""
    if not team_ids:
        return {}
    return {t.id: t.abbreviation for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}


def _batch_compute_injury_impacts(
    db: Session, team_ids: set[int], min_season: int
) -> dict[int, tuple[str, set[tuple[int, int]]]]:
    """
    For each team, find an established player (recorded a stat line in >=8 of
    the team's weeks) who then missed 2-6 of those weeks — a real, temporary
    injury absence, not a rookie's early-season inactives or a single bye week.
    A missing PlayerWeeklyStat row for an established player *is* the signal:
    nflverse only records a row when a player actually recorded a stat, so its
    absence for someone who otherwise plays every week means they didn't suit up.

    Returns {team_id: (teammate_name, missed_weeks)} — the most recent
    qualifying absence per team, for other teammates' "hit rate without
    {teammate}" to be computed against.
    """
    if not team_ids:
        return {}
    rows = (
        db.query(PlayerWeeklyStat.season, PlayerWeeklyStat.week, Player.id, Player.team_id, Player.full_name)
        .join(Player, PlayerWeeklyStat.player_id == Player.id)
        .filter(Player.team_id.in_(team_ids), PlayerWeeklyStat.season >= min_season)
        .all()
    )
    weeks_by_player: dict[int, set[tuple[int, int]]] = defaultdict(set)
    team_by_player: dict[int, int] = {}
    name_by_player: dict[int, str] = {}
    team_weeks: dict[int, set[tuple[int, int]]] = defaultdict(set)
    for season, week, player_id, team_id, full_name in rows:
        weeks_by_player[player_id].add((season, week))
        team_by_player[player_id] = team_id
        name_by_player[player_id] = full_name
        team_weeks[team_id].add((season, week))

    result: dict[int, tuple[str, set[tuple[int, int]]]] = {}
    for player_id, weeks in weeks_by_player.items():
        if len(weeks) < 8:
            continue
        team_id = team_by_player[player_id]
        missing = team_weeks[team_id] - weeks
        if not (2 <= len(missing) <= 6):
            continue
        existing = result.get(team_id)
        if existing is None or max(missing) > max(existing[1]):
            result[team_id] = (name_by_player[player_id], missing)
    return result


def _injury_impact_rate(
    logs: list[PlayerWeeklyStat], stat_name: str, threshold: float, missed_weeks: set[tuple[int, int]]
) -> tuple[int, int]:
    """This player's hit rate restricted to exactly the weeks a teammate missed."""
    matching = [s for s in logs if (s.season, s.week) in missed_weeks]
    return (sum(1 for s in matching if getattr(s, stat_name, 0) > threshold), len(matching))


def _batch_fetch_player_prop_odds(db: Session, player_ids: set[int]) -> dict[int, list[PlayerPropOdds]]:
    """One query for every real market line we've ingested for these players — only
    populated for the handful of upcoming games ingest_player_prop_odds() covers."""
    if not player_ids:
        return {}
    rows = db.query(PlayerPropOdds).filter(PlayerPropOdds.player_id.in_(player_ids)).all()
    by_player: dict[int, list[PlayerPropOdds]] = defaultdict(list)
    for row in rows:
        by_player[row.player_id].append(row)
    return by_player


def _match_market_edge(
    odds_rows: list[PlayerPropOdds],
    player_logs: list[PlayerWeeklyStat],
    stat_name: str,
    direction: str,
    min_season: int,
) -> tuple[float, float, float, int, int, float] | None:
    """
    Finds a real market line for this player/stat and recomputes OUR hit rate
    directly against THAT real line (not our own independently-chosen
    threshold) — comparing hit rate for a threshold of 20.5 against a market
    priced at 41.5 would be an apples-to-oranges "edge" even though both are
    real numbers. Requires >=3 games in the window to avoid a fabricated edge
    off a tiny recomputed sample. Returns
    (line, price, implied_prob, hits, games, edge) or None if we have no real
    matching odds or too few games to grade them against.
    """
    market_key = STAT_TO_PLAYER_MARKET.get(stat_name)
    if market_key is None:
        return None
    matching = [r for r in odds_rows if r.market == market_key]
    if not matching:
        return None
    line_row = matching[0]
    price = line_row.over_price if direction == "over" else line_row.under_price
    if price is None:
        return None

    relevant_logs = [g for g in player_logs if g.season >= min_season]
    if direction == "over":
        hits = sum(1 for g in relevant_logs if getattr(g, stat_name, 0) > line_row.line)
    else:
        hits = sum(1 for g in relevant_logs if getattr(g, stat_name, 0) < line_row.line)
    games = len(relevant_logs)
    if games < 3:
        return None

    if line_row.over_price is not None and line_row.under_price is not None:
        over_prob, under_prob = devig_two_way(line_row.over_price, line_row.under_price)
        implied_prob = over_prob if direction == "over" else under_prob
    else:
        implied_prob = american_to_implied_prob(price)

    edge = hits / games - implied_prob
    return (line_row.line, price, round(implied_prob, 3), hits, games, round(edge, 3))



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


def _get_cheatsheet_internal(
    sport: str,
    season: int | None,
    week: int | None,
    days_back: int | None,
    min_hit_rate: float,
    min_games: int,
    db: Session,
) -> list[CheatsheetRowOut]:
    """
    Internal helper to get cheatsheet rows (reusable for /groups endpoint).
    
    Query parameters:
    - season, week: Filter to players playing that week (historical)
    - days_back: Filter to games in last N days (0=today, 1=last 24h, etc) for "Trending Today"
    - min_hit_rate: Minimum hit rate (0.0 to 1.0)
    - min_games: Minimum number of games to qualify
    """
    # Query with limit to avoid loading too much data
    # Order by recent_form_hits DESC to prioritize high hit-rate signals
    query = (
        db.query(PlayerTrendSignal)
        .options(joinedload(PlayerTrendSignal.player).joinedload(Player.team))
        .filter(
            PlayerTrendSignal.sport == sport,
            PlayerTrendSignal.recent_form_games >= min_games
        )
    )
    # When not recomputing from daily stats, the precomputed hits/games ratio
    # already tells us the hit rate — push the min_hit_rate filter down into
    # SQL so we don't pull thousands of rows over the wire just to drop them.
    if days_back is None and min_hit_rate > 0:
        query = query.filter(
            PlayerTrendSignal.recent_form_hits >= min_hit_rate * PlayerTrendSignal.recent_form_games
        )
    signals = (
        query
        .order_by(PlayerTrendSignal.recent_form_hits.desc())  # Prioritize high hit rates
        .limit(5000)  # Increased from 200 to capture enough high-hit-rate signals
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
    
    # Pre-fetch all games in date range if days_back is set
    games_in_range = None
    stats_by_player_in_range: dict[int, list[PlayerWeeklyStat]] = {}
    if days_back is not None:
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        games_in_range = db.query(Game.id).filter(
            Game.sport == sport,
            Game.kickoff >= cutoff_date
        ).all()
        games_in_range = {g[0] for g in games_in_range}
        if games_in_range:
            # Batch-fetch stats for every signal's player up front instead of
            # one query per signal inside the loop below.
            player_ids_in_signals = {s.player_id for s in signals}
            stats_in_range = db.query(PlayerWeeklyStat).filter(
                PlayerWeeklyStat.player_id.in_(player_ids_in_signals),
                PlayerWeeklyStat.game_id.in_(games_in_range),
            ).all()
            for stat in stats_in_range:
                stats_by_player_in_range.setdefault(stat.player_id, []).append(stat)
    
    # Pre-calculate next game for each team to avoid N queries
    next_game_by_team: dict[int, Game | None] = {}
    all_team_ids = set()
    for signal in signals:
        if signal.player.team_id:
            all_team_ids.add(signal.player.team_id)
    
    if all_team_ids:
        next_games = (
            db.query(Game)
            .filter(
                Game.sport == sport,
                Game.status.in_(["scheduled", "in_progress"]),
                (Game.home_team_id.in_(all_team_ids)) | (Game.away_team_id.in_(all_team_ids))
            )
            .order_by(Game.kickoff.asc())
            .all()
        )
        # Build mapping of team_id -> next game
        for game in next_games:
            if game.home_team_id in all_team_ids and game.home_team_id not in next_game_by_team:
                next_game_by_team[game.home_team_id] = game
            if game.away_team_id in all_team_ids and game.away_team_id not in next_game_by_team:
                next_game_by_team[game.away_team_id] = game
    
    # Get current season for opponent rank calculations (single query instead of two)
    if season:
        current_season = season
    else:
        latest_game = db.query(Game).filter(Game.sport == sport).order_by(Game.season.desc()).first()
        current_season = latest_game.season if latest_game else 2026

    # First pass: compute hits/games/hit_rate and apply filters, but skip the
    # expensive per-row injury/opponent-rank lookups until we know which rows
    # actually make the final top-100 cut.
    candidates: list[tuple[PlayerTrendSignal, int, int, float]] = []
    for signal in signals:
        # Skip if player's team is not playing this week
        if playing_team_ids is not None and signal.player.team_id not in playing_team_ids:
            continue
        
        # Use daily hit-rate if days_back specified, otherwise use precomputed signal
        if games_in_range is not None:  # days_back was set
            stats = stats_by_player_in_range.get(signal.player_id, [])
            
            hits = sum(1 for s in stats if getattr(s, signal.stat_name, 0) > signal.threshold)
            games = len(stats)
            if games < min_games:
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
        
        candidates.append((signal, hits, games, hit_rate))

    candidates.sort(key=lambda c: (-c[3], -c[2]))
    candidates = candidates[:100]

    # Batch-fetch injury and opponent-rank data for only the rows that survived
    # the cut above (was previously one query per row for every candidate).
    opponent_lookups: set[tuple[int, int]] = set()
    opponent_ids: set[int] = set()
    for signal, _, _, _ in candidates:
        next_game = next_game_by_team.get(signal.player.team_id) if signal.player.team_id else None
        if next_game:
            opponent_id = (
                next_game.away_team_id
                if next_game.home_team_id == signal.player.team_id
                else next_game.home_team_id
            )
            if opponent_id:
                opponent_lookups.add((opponent_id, current_season))
                opponent_ids.add(opponent_id)
    opponent_ranks = _batch_calculate_opponent_ranks(db, opponent_lookups)
    opponent_abbrs = _batch_fetch_team_abbreviations(db, opponent_ids)
    stats_by_player = _batch_fetch_player_logs(db, {signal.player_id for signal, _, _, _ in candidates})
    injury_impacts = _batch_compute_injury_impacts(
        db, {signal.player.team_id for signal, _, _, _ in candidates if signal.player.team_id}, current_season - 1
    )
    market_odds_by_player = _batch_fetch_player_prop_odds(db, {signal.player_id for signal, _, _, _ in candidates})
    # Same 2-season span as the small-sample blending rule, so split/h2h reflect
    # "recent" history rather than a player's entire career.
    min_season = current_season - 1

    rows: list[CheatsheetRowOut] = []
    for signal, hits, games, hit_rate in candidates:
        # Use pre-calculated next game from cache instead of querying
        game_id = None
        game_kickoff = None
        is_home = None
        opponent_rank = None
        opponent_team_count = None
        opponent_id = None
        opponent_abbr = None
        
        if signal.player.team_id and signal.player.team_id in next_game_by_team:
            next_game = next_game_by_team[signal.player.team_id]
            if next_game:
                game_id = next_game.id
                game_kickoff = next_game.kickoff.isoformat() if next_game.kickoff else None
                is_home = next_game.home_team_id == signal.player.team_id
                
                # Look up pre-calculated opponent defensive rank
                opponent_id = next_game.away_team_id if is_home else next_game.home_team_id
                opp_rank = opponent_ranks.get((opponent_id, current_season)) if opponent_id else None
                opponent_rank = opp_rank
                opponent_team_count = 32 if opp_rank else None
                opponent_abbr = opponent_abbrs.get(opponent_id) if opponent_id else None
        
        player_logs = stats_by_player.get(signal.player_id, [])
        split_hits, split_games = _home_away_split_rate(
            player_logs, signal.stat_name, signal.threshold, is_home, min_season
        )
        h2h_hits, h2h_games = _head_to_head_rate(
            player_logs, signal.stat_name, signal.threshold, opponent_id, min_season
        )

        without_player = None
        without_player_hits = None
        without_player_games = None
        team_absence = injury_impacts.get(signal.player.team_id) if signal.player.team_id else None
        if team_absence:
            teammate_name, missed_weeks = team_absence
            if teammate_name != signal.player.full_name:
                imp_hits, imp_games = _injury_impact_rate(
                    player_logs, signal.stat_name, signal.threshold, missed_weeks
                )
                if imp_games >= 2:
                    without_player = teammate_name
                    without_player_hits = imp_hits
                    without_player_games = imp_games
        
        ci_low, ci_high = wilson_interval(hits, games)

        market_line = None
        market_price = None
        market_implied_prob = None
        market_hits = None
        market_games = None
        edge = None
        market_match = _match_market_edge(
            market_odds_by_player.get(signal.player_id, []), player_logs, signal.stat_name, signal.direction, min_season
        )
        if market_match:
            market_line, market_price, market_implied_prob, market_hits, market_games, edge = market_match

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
                hit_rate_ci_low=round(ci_low, 3),
                hit_rate_ci_high=round(ci_high, 3),
                market_line=market_line,
                market_price=market_price,
                market_implied_prob=market_implied_prob,
                market_hits=market_hits,
                market_games=market_games,
                edge=edge,
                # Derived from actual roster participation (a missing weekly-stat
                # row for an established player = didn't play that week), not
                # fabricated — see _batch_compute_injury_impacts.
                without_player=without_player,
                without_player_hits=without_player_hits,
                without_player_games=without_player_games,
                opponent_rank=opponent_rank,
                opponent_team_count=opponent_team_count,
                opponent_team=opponent_abbr,
                # Contextual signal data for Linemate-style badges, computed live
                # against the specific upcoming opponent/venue (not precomputed).
                split_hits=split_hits if split_games > 0 else None,
                split_games=split_games if split_games > 0 else None,
                h2h_hits=h2h_hits if h2h_games > 0 else None,
                h2h_games=h2h_games if h2h_games > 0 else None,
                # Game information for sorting by upcoming games
                game_id=game_id,
                game_kickoff=game_kickoff,
                is_home=is_home,
            )
        )
    rows.sort(key=lambda r: (-r.hit_rate, -r.games))
    return rows[:100]  # Return max 100 results


@router.get("/cheatsheet", response_model=list[CheatsheetRowOut])
@ttl_cache(seconds=300)
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
@ttl_cache(seconds=300)
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
        db=db
    )
    
    if not rows:
        return TrendGroupsOut(
            recent_form=[],
            versus_opponent=[],
            injury_impact=[],
            opponent_rank=[],
            home_away_splits=[],
            alternate_lines=[],
            unders_only=[],
            team_form=[],
        )
    
    # Categorize by signal attributes
    # Priority 1: High hit rate signals (75%+)
    recent_form = [r for r in rows if r.hit_rate >= 0.75][:5]  # Strong recent form (75%+ hit rate)
    
    # Priority 2: Head-to-head signals — require the H2H history to actually
    # confirm the pick (>=50%), not just have some games on record (a 0/3
    # head-to-head record is evidence *against* the pick, not a signal for it).
    versus_opponent = [r for r in rows if r.h2h_games and r.h2h_hits is not None and r.h2h_hits / r.h2h_games >= 0.5][:5]
    
    # Priority 3: Home/Away splits — same confirming-evidence rule as above.
    home_away_splits = [
        r for r in rows if r.split_games and r.split_hits is not None and r.split_hits / r.split_games >= 0.5
    ][:5]
    
    # Priority 4: Opponent rank — only a genuine "edge" (weak defense for an
    # over, stingy defense for an under), not just any calculated rank.
    def _is_matchup_edge(r: CheatsheetRowOut) -> bool:
        if r.opponent_rank is None or not r.opponent_team_count:
            return False
        midpoint = r.opponent_team_count / 2
        return r.opponent_rank <= midpoint if r.direction == "under" else r.opponent_rank > midpoint

    opponent_rank = [r for r in rows if _is_matchup_edge(r)][:5]  # Ranked matchups
    
    # Priority 5: Injury impact — backed by real roster participation (see
    # _batch_compute_injury_impacts), only when the "without teammate" games
    # actually confirm the pick.
    injury_impact = [
        r
        for r in rows
        if r.without_player_games and r.without_player_hits is not None and r.without_player_hits / r.without_player_games >= 0.5
    ][:5]
    
    # Fill remaining categories with top performers
    used_rows = set(id(r) for r in recent_form + versus_opponent + home_away_splits + opponent_rank + injury_impact)
    remaining = [r for r in rows if id(r) not in used_rows]
    
    # Alternate lines: overs/unders with good hit rates
    alternate_lines = [r for r in remaining if "over" in r.direction.lower() or "under" in r.direction.lower()][:5]
    
    # Unders only: specifically targeting under bets
    unders_only = [r for r in remaining if "under" in r.direction.lower()][:5]
    
    # Team form: remaining top performers
    team_form = remaining[5:10] if len(remaining) > 5 else []
    
    return TrendGroupsOut(
        recent_form=recent_form,
        versus_opponent=versus_opponent,
        injury_impact=injury_impact,
        opponent_rank=opponent_rank,
        home_away_splits=home_away_splits,
        alternate_lines=alternate_lines,
        unders_only=unders_only,
        team_form=team_form,
    )
