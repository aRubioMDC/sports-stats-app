from datetime import datetime
from uuid import uuid4

import pandas as pd

from app.core.query_helpers import serialize_kickoff
from app.db import SessionLocal
from app.etl.ingest_schedules import _upsert_games_from_schedule
from app.models import Game, Team


def test_nfl_kickoff_is_stored_as_utc_timestamp():
    db = SessionLocal()
    try:
        tag = uuid4().hex[:6].upper()
        home_abbr = f"T{tag}1"
        away_abbr = f"T{tag}2"
        home = Team(sport="nfl", abbreviation=home_abbr, name="Test Team One", conference="AFC", division="East")
        away = Team(sport="nfl", abbreviation=away_abbr, name="Test Team Two", conference="NFC", division="West")
        db.add_all([home, away])
        db.flush()

        schedule = pd.DataFrame([
            {
                "game_id": "nfl_2025010101",
                "season": 2025,
                "week": 1,
                "game_type": "REG",
                "gameday": "2025-09-07",
                "gametime": "13:00",
                "home_team": home_abbr,
                "away_team": away_abbr,
                "home_score": float("nan"),
                "away_score": float("nan"),
            }
        ])

        _upsert_games_from_schedule(db, schedule, {home_abbr: home.id, away_abbr: away.id})
        db.commit()

        game = db.query(Game).filter(Game.nflverse_game_id == "nfl_2025010101").one()

        assert game.kickoff is not None
        assert game.kickoff.tzinfo is None
        assert game.kickoff == datetime(2025, 9, 7, 17, 0)
        assert serialize_kickoff(game.kickoff) == "2025-09-07T17:00:00+00:00"
    finally:
        db.close()
