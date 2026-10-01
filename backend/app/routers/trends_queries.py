"""Batch-fetch / rate-calculation helpers for trends_service.py.

Split out of routers/trends.py (SOLID audit: the router file mixed route
handlers, batch queries, and business logic in one ~830-line module) — these
are pure data lookups, no response-shaping.
"""

from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import and_
from sqlalchemy.orm import Session

from ..models import Game, Player, PlayerPropOdds, PlayerWeeklyStat, Team, TeamSeasonStats


def batch_calculate_opponent_ranks(
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


def batch_fetch_player_logs(db: Session, player_ids: set[int]) -> dict[int, list[PlayerWeeklyStat]]:
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


def home_away_split_rate(
    logs: list[PlayerWeeklyStat], stat_name: str, threshold: float, is_home: bool | None, min_season: int
) -> tuple[int, int]:
    """Hit rate restricted to past games in the same home/away context as the upcoming game."""
    if is_home is None:
        return (0, 0)
    matching = [s for s in logs if s.is_home == is_home and s.season >= min_season]
    return (sum(1 for s in matching if getattr(s, stat_name, 0) > threshold), len(matching))


def head_to_head_rate(
    logs: list[PlayerWeeklyStat], stat_name: str, threshold: float, opponent_team_id: int | None, min_season: int
) -> tuple[int, int]:
    """Hit rate restricted to past meetings against the upcoming opponent."""
    if opponent_team_id is None:
        return (0, 0)
    matching = [s for s in logs if s.opponent_team_id == opponent_team_id and s.season >= min_season]
    return (sum(1 for s in matching if getattr(s, stat_name, 0) > threshold), len(matching))


def batch_fetch_team_abbreviations(db: Session, team_ids: set[int]) -> dict[int, str]:
    """One query for every opponent's abbreviation, for the "{TEAM} is a good matchup" copy."""
    if not team_ids:
        return {}
    return {t.id: t.abbreviation for t in db.query(Team).filter(Team.id.in_(team_ids)).all()}


def batch_compute_injury_impacts(
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


def injury_impact_rate(
    logs: list[PlayerWeeklyStat], stat_name: str, threshold: float, missed_weeks: set[tuple[int, int]]
) -> tuple[int, int]:
    """This player's hit rate restricted to exactly the weeks a teammate missed."""
    matching = [s for s in logs if (s.season, s.week) in missed_weeks]
    return (sum(1 for s in matching if getattr(s, stat_name, 0) > threshold), len(matching))


def batch_fetch_player_prop_odds(db: Session, player_ids: set[int]) -> dict[int, list[PlayerPropOdds]]:
    """One query for every real market line we've ingested for these players — only
    populated for the handful of upcoming games ingest_player_prop_odds() covers."""
    if not player_ids:
        return {}
    rows = db.query(PlayerPropOdds).filter(PlayerPropOdds.player_id.in_(player_ids)).all()
    by_player: dict[int, list[PlayerPropOdds]] = defaultdict(list)
    for row in rows:
        by_player[row.player_id].append(row)
    return by_player


def calculate_daily_hit_rate(
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
