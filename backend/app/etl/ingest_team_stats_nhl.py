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
from .nhl_client import get_final_standings, get_standings_now
from .stat_window import get_stat_window

STAT_FIELD_TO_RANK_FIELD = {
    "points_per_game": "points_per_game_rank",
    "yards_per_game": "yards_per_game_rank",
    "time_of_possession_seconds_per_game": "time_of_possession_rank",
    "def_sacks_total": "def_sacks_rank",
}

_TOTAL_KEYS = ("gamesPlayed", "goalFor", "goalDifferential", "wins", "points")


def _totals(row: dict) -> dict[str, float]:
    return {key: row.get(key) or 0 for key in _TOTAL_KEYS}


def _slot_values(totals: dict[str, float]) -> dict[str, float]:
    games = totals["gamesPlayed"]
    if not games:
        return {field: 0.0 for field in STAT_FIELD_TO_RANK_FIELD}
    return {
        "points_per_game": round(totals["points"] / (2 * games), 3),  # real points percentage
        "yards_per_game": round(totals["goalFor"] / games, 2),  # real goals for/game
        "time_of_possession_seconds_per_game": round(totals["goalDifferential"] / games, 2),  # real goal differential/game
        "def_sacks_total": round(totals["wins"] / games, 3),  # real win pct
    }


def ingest_team_stats_nhl(season: int) -> None:
    db: Session = SessionLocal()
    try:
        teams = {t.abbreviation: t for t in db.query(Team).filter(Team.sport == "nhl").all()}
        current = {
            row["teamAbbrev"]["default"]: _totals(row)
            for row in get_standings_now()
            if row["teamAbbrev"]["default"] in teams
        }
        previous_season = season - 10001  # 20262027 -> 20252026
        previous: dict[str, dict[str, float]] = {}

        rows: dict[str, dict] = {}
        for abbr in teams:
            totals = current.get(abbr, _totals({}))
            window = get_stat_window(season, int(totals["gamesPlayed"]), previous_season)
            window_mode = "current"
            if window.window_mode == "blended":
                if not previous:
                    previous = {r["teamAbbrev"]["default"]: _totals(r) for r in get_final_standings(previous_season)}
                if abbr in previous:
                    totals = {key: totals[key] + previous[abbr][key] for key in _TOTAL_KEYS}
                    window_mode = "blended"
            rows[abbr] = {
                "weeks_played": int(current.get(abbr, {"gamesPlayed": 0})["gamesPlayed"]),
                "window_mode": window_mode,
                **_slot_values(totals),
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
            stat.window_mode = data["window_mode"]
            for field in ranked_fields:
                setattr(stat, field, data[field])
                setattr(stat, STAT_FIELD_TO_RANK_FIELD[field], ranks[field][abbr])
        db.commit()
    finally:
        db.close()
