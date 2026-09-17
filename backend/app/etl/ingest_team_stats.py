"""Aggregate team-level box score stats (PPG, yards/game, TOP, def sacks/INTs,
turnover differential) from nflverse team-game stats, applying the small-sample
blending rule, then write ranked TeamSeasonStats rows.
"""

import nflreadpy as nfl
import pandas as pd
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.etl.stat_window import get_stat_window
from app.models import Game, Team, TeamSeasonStats

STAT_FIELD_TO_RANK_FIELD = {
    "points_per_game": "points_per_game_rank",
    "yards_per_game": "yards_per_game_rank",
    "time_of_possession_seconds_per_game": "time_of_possession_rank",
    "def_sacks_total": "def_sacks_rank",
    "def_interceptions_total": "def_interceptions_rank",
    "turnover_differential_total": "turnover_differential_rank",
}


def _time_of_possession_by_team_game(seasons: list[int]) -> pd.DataFrame:
    pbp = nfl.load_pbp(seasons).to_pandas()
    drives = pbp.dropna(subset=["drive_time_of_possession"]).drop_duplicates(
        subset=["game_id", "posteam", "drive"]
    )

    def to_seconds(value: str) -> int:
        minutes, seconds = value.split(":")
        return int(minutes) * 60 + int(seconds)

    drives = drives.assign(top_seconds=drives["drive_time_of_possession"].map(to_seconds))
    return (
        drives.groupby(["game_id", "posteam"])["top_seconds"]
        .sum()
        .reset_index()
        .rename(columns={"posteam": "team"})
    )


def _load_team_game_stats(seasons: list[int]) -> pd.DataFrame:
    team_stats = nfl.load_team_stats(seasons, summary_level="week").to_pandas()
    team_stats["yards"] = team_stats["passing_yards"] + team_stats["rushing_yards"]
    team_stats["turnovers_forced"] = (
        team_stats["def_interceptions"] + team_stats["fumble_recovery_opp"]
    )
    team_stats["turnovers_committed"] = (
        team_stats["passing_interceptions"] + team_stats["fumbles_lost_total"]
    )
    team_stats["turnover_differential"] = (
        team_stats["turnovers_forced"] - team_stats["turnovers_committed"]
    )
    top_df = _time_of_possession_by_team_game(seasons)
    return team_stats.merge(top_df, on=["game_id", "team"], how="left").fillna({"top_seconds": 0})


def ingest_team_stats(current_season: int) -> None:
    db: Session = SessionLocal()
    try:
        teams = {t.abbreviation: t for t in db.query(Team).filter(Team.sport == "nfl").all()}
        games = (
            db.query(Game)
            .filter(Game.sport == "nfl", Game.season == current_season, Game.status == "final")
            .all()
        )
        weeks_played_by_team: dict[str, int] = {}
        for game in games:
            weeks_played_by_team[game.home_team.abbreviation] = (
                weeks_played_by_team.get(game.home_team.abbreviation, 0) + 1
            )
            weeks_played_by_team[game.away_team.abbreviation] = (
                weeks_played_by_team.get(game.away_team.abbreviation, 0) + 1
            )

        windows = {
            abbr: get_stat_window(current_season, weeks_played_by_team.get(abbr, 0))
            for abbr in teams
        }
        seasons_needed = sorted({s for w in windows.values() for s in w.seasons_included})
        team_game_stats = _load_team_game_stats(seasons_needed)
        game_scores = {
            g.nflverse_game_id: (g.home_team.abbreviation, g.home_score, g.away_team.abbreviation, g.away_score)
            for g in db.query(Game).filter(Game.sport == "nfl", Game.season.in_(seasons_needed)).all()
            if g.status == "final"
        }

        rows: dict[str, dict] = {}
        for abbr, window in windows.items():
            team_games = team_game_stats[
                (team_game_stats["team"] == abbr)
                & (team_game_stats["game_id"].isin(game_scores.keys()))
            ]
            if team_games.empty:
                continue
            points = []
            for gid in team_games["game_id"]:
                home_abbr, home_score, away_abbr, away_score = game_scores[gid]
                points.append(home_score if abbr == home_abbr else away_score)
            n = len(team_games)
            rows[abbr] = {
                "weeks_played": weeks_played_by_team.get(abbr, 0),
                "window_mode": window.window_mode,
                "points_per_game": float(sum(points) / n),
                "yards_per_game": float(team_games["yards"].sum() / n),
                "time_of_possession_seconds_per_game": float(team_games["top_seconds"].sum() / n),
                "def_sacks_total": float(team_games["def_sacks"].sum()),
                "def_interceptions_total": float(team_games["def_interceptions"].sum()),
                "turnover_differential_total": float(team_games["turnover_differential"].sum()),
            }

        # Rank each stat 1..32 (1 = best) across all teams for this refresh.
        for field, rank_field in STAT_FIELD_TO_RANK_FIELD.items():
            ranked = sorted(rows.items(), key=lambda kv: kv[1][field], reverse=True)
            for rank, (abbr, _) in enumerate(ranked, start=1):
                rows[abbr][rank_field] = rank

        for abbr, data in rows.items():
            team = teams[abbr]
            stat = (
                db.query(TeamSeasonStats)
                .filter(TeamSeasonStats.team_id == team.id, TeamSeasonStats.season == current_season)
                .one_or_none()
            )
            if stat is None:
                stat = TeamSeasonStats(sport="nfl", team_id=team.id, season=current_season)
                db.add(stat)
            for key, value in data.items():
                setattr(stat, key, value)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    ingest_team_stats(settings.current_season)
