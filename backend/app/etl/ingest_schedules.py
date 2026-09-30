"""Pull season schedule/results from nflverse and upsert Team + Game rows."""

from datetime import datetime

import nflreadpy as nfl
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Game, Team


def upsert_teams(db: Session) -> dict[str, int]:
    desc = nfl.load_teams().to_pandas()
    abbrev_to_id: dict[str, int] = {}
    for _, row in desc.iterrows():
        abbrev = row["team_abbr"]
        team = db.query(Team).filter(Team.sport == "nfl", Team.abbreviation == abbrev).one_or_none()
        if team is None:
            team = Team(sport="nfl", abbreviation=abbrev)
            db.add(team)
        team.name = row.get("team_name", abbrev)
        team.conference = row.get("team_conf", "")
        team.division = row.get("team_division", "")
        team.primary_color = row.get("team_color", "#000000") or "#000000"
        team.logo_url = row.get("team_logo_espn", "") or ""
        db.flush()
        abbrev_to_id[abbrev] = team.id
    db.commit()
    return abbrev_to_id


def ingest_schedules(season: int) -> None:
    db = SessionLocal()
    try:
        team_ids = upsert_teams(db)
        schedule = nfl.load_schedules([season]).to_pandas()
        for _, row in schedule.iterrows():
            home_abbr, away_abbr = row["home_team"], row["away_team"]
            if home_abbr not in team_ids or away_abbr not in team_ids:
                continue
            game = (
                db.query(Game)
                .filter(Game.nflverse_game_id == row["game_id"])
                .one_or_none()
            )
            if game is None:
                game = Game(sport="nfl", nflverse_game_id=row["game_id"])
                db.add(game)
            game.season = int(row["season"])
            game.week = int(row["week"])
            game.game_type = row.get("game_type", "REG")
            gameday = row.get("gameday")
            gametime = row.get("gametime")
            if gameday and gametime:
                game.kickoff = datetime.strptime(f"{gameday} {gametime}", "%Y-%m-%d %H:%M")
            elif gameday:
                game.kickoff = datetime.strptime(gameday, "%Y-%m-%d")
            else:
                game.kickoff = None
            game.home_team_id = team_ids[home_abbr]
            game.away_team_id = team_ids[away_abbr]
            home_score, away_score = row.get("home_score"), row.get("away_score")
            game.home_score = int(home_score) if home_score == home_score else None  # NaN check
            game.away_score = int(away_score) if away_score == away_score else None
            game.status = "final" if game.home_score is not None else "scheduled"
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    import nflreadpy as nfl_data

    ingest_schedules(nfl_data.get_current_season())
