"""Pull weekly player stat lines from nflverse and upsert Player + PlayerWeeklyStat rows.

Preloads existing Player/PlayerWeeklyStat rows into memory up front instead of
querying per row — a per-row round trip is fine against local SQLite but adds
minutes of latency against a remote DB (e.g. Supabase's pooler) at this data volume.
"""

import nflreadpy as nfl
import pandas as pd
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import Game, Player, PlayerWeeklyStat, Team


def ingest_player_stats(seasons: list[int]) -> None:
    db: Session = SessionLocal()
    try:
        team_ids = {t.abbreviation: t.id for t in db.query(Team).filter(Team.sport == "nfl").all()}
        games_by_key = {
            (g.season, g.week, g.home_team.abbreviation, g.away_team.abbreviation): g
            for g in db.query(Game).filter(Game.sport == "nfl", Game.season.in_(seasons)).all()
        }
        players_by_gsis = {
            p.gsis_id: p for p in db.query(Player).filter(Player.sport == "nfl").all()
        }
        existing_stats = {
            (s.player_id, s.season, s.week): s
            for s in db.query(PlayerWeeklyStat)
            .join(Player)
            .filter(Player.sport == "nfl", PlayerWeeklyStat.season.in_(seasons))
            .all()
        }

        weekly = nfl.load_player_stats(seasons, summary_level="week").to_pandas()
        for _, row in weekly.iterrows():
            if pd.isna(row.get("player_id")) or pd.isna(row.get("player_display_name")):
                continue
            gsis_id = row["player_id"]
            team_abbr = row.get("team")
            team_id = team_ids.get(team_abbr)

            player = players_by_gsis.get(gsis_id)
            if player is None:
                player = Player(
                    sport="nfl",
                    gsis_id=gsis_id,
                    full_name=row.get("player_display_name", "Unknown"),
                    position=row.get("position", ""),
                    team_id=team_id,
                )
                db.add(player)
                db.flush()  # need player.id for the weekly-stat key below
                players_by_gsis[gsis_id] = player
            else:
                player.full_name = row.get("player_display_name", "Unknown")
                player.position = row.get("position", "")
                player.team_id = team_id

            opponent_abbr = row.get("opponent_team")
            key_home = (row["season"], row["week"], team_abbr, opponent_abbr)
            key_away = (row["season"], row["week"], opponent_abbr, team_abbr)
            game = games_by_key.get(key_home) or games_by_key.get(key_away)

            stat_key = (player.id, row["season"], row["week"])
            stat = existing_stats.get(stat_key)
            if stat is None:
                stat = PlayerWeeklyStat(player_id=player.id, season=row["season"], week=row["week"])
                db.add(stat)
                existing_stats[stat_key] = stat
            stat.game_id = game.id if game else None
            stat.opponent_team_id = team_ids.get(opponent_abbr)
            stat.is_home = bool(game and game.home_team_id == team_id)
            stat.receptions = row.get("receptions", 0) or 0
            stat.receiving_yards = row.get("receiving_yards", 0) or 0
            stat.rushing_yards = row.get("rushing_yards", 0) or 0
            stat.passing_yards = row.get("passing_yards", 0) or 0
            stat.passing_tds = row.get("passing_tds", 0) or 0
            stat.rushing_tds = row.get("rushing_tds", 0) or 0
            stat.receiving_tds = row.get("receiving_tds", 0) or 0
        db.commit()
    finally:
        db.close()



if __name__ == "__main__":
    ingest_player_stats([settings.current_season - 1, settings.current_season])
