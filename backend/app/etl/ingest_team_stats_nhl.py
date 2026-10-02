"""Aggregate real team-level season stats from the NHL standings API into
TeamSeasonStats — the NHL counterpart of ingest_team_stats.py.

Reuses the existing 6-slot TeamSeasonStats shape, mapping 4 real, "higher is
better" standings stats onto 4 of the slots (see sports/nhl_adapter.py's
STAT_ROW_DEFS for the real labels shown to users — the matchup comparison
card's leader logic assumes higher always wins, so only higher-is-better
stats are used here).
"""

from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Team, TeamSeasonStats
from .nhl_client import get_standings_now

STAT_FIELD_TO_RANK_FIELD = {
    "points_per_game": "points_per_game_rank",
    "yards_per_game": "yards_per_game_rank",
    "time_of_possession_seconds_per_game": "time_of_possession_rank",
    "def_sacks_total": "def_sacks_rank",
}


def ingest_team_stats_nhl(season: int) -> None:
    db: Session = SessionLocal()
    try:
        teams = {t.abbreviation: t for t in db.query(Team).filter(Team.sport == "nhl").all()}
        standings = get_standings_now()

        rows: dict[str, dict] = {
            abbr: {
                "weeks_played": 0,
                "points_per_game": 0.0,
                "yards_per_game": 0.0,
                "time_of_possession_seconds_per_game": 0.0,
                "def_sacks_total": 0.0,
            }
            for abbr in teams
        }
        for row in standings:
            abbr = row["teamAbbrev"]["default"]
            if abbr not in teams:
                continue
            games_played = row.get("gamesPlayed") or 0
            rows[abbr] = {
                "weeks_played": games_played,
                "points_per_game": round(row.get("pointPctg", 0.0), 3),  # real points percentage
                "yards_per_game": round((row.get("goalFor", 0) / games_played), 2) if games_played else 0.0,  # real goals for/game
                "time_of_possession_seconds_per_game": round(
                    (row.get("goalDifferential", 0) / games_played), 2
                ) if games_played else 0.0,  # real goal differential/game
                "def_sacks_total": round(((row.get("wins") or 0) / games_played), 3) if games_played else 0.0,  # real win pct
            }

        ranked_fields = list(STAT_FIELD_TO_RANK_FIELD.keys())
        ranks: dict[str, dict[str, int]] = {f: {} for f in ranked_fields}
        for field in ranked_fields:
            ordered = sorted(rows.items(), key=lambda kv: (-kv[1][field], kv[0]))
            for idx, (abbr, _) in enumerate(ordered, start=1):
                ranks[field][abbr] = idx

        for abbr, data in rows.items():
            team = teams[abbr]
            stat = (
                db.query(TeamSeasonStats)
                .filter(
                    TeamSeasonStats.sport == "nhl",
                    TeamSeasonStats.team_id == team.id,
                    TeamSeasonStats.season == season,
                )
                .one_or_none()
            )
            if stat is None:
                stat = TeamSeasonStats(sport="nhl", team_id=team.id, season=season)
                db.add(stat)
            stat.weeks_played = data["weeks_played"]
            stat.window_mode = "current"
            for field in ranked_fields:
                setattr(stat, field, data[field])
                setattr(stat, STAT_FIELD_TO_RANK_FIELD[field], ranks[field][abbr])
        db.commit()
    finally:
        db.close()
