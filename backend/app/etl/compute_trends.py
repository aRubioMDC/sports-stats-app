"""Compute Linemate-style hit-rate trend signals per (player, stat, threshold),
using the same small-sample blending rule as team stats.
"""

from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.etl.stat_window import get_stat_window
from app.models import Player, PlayerTrendSignal, PlayerWeeklyStat

STAT_NAMES = ["receptions", "receiving_yards", "rushing_yards", "passing_yards"]
# Common sportsbook-style thresholds per stat, used to seed cheatsheet rows.
DEFAULT_THRESHOLDS = {
    "receptions": [1.5, 3.5, 4.5],
    "receiving_yards": [24.5, 49.5, 74.5],
    "rushing_yards": [24.5, 49.5, 74.5],
    "passing_yards": [199.5, 249.5, 299.5],
}


def _weeks_played(db: Session, player_id: int, season: int) -> int:
    return (
        db.query(PlayerWeeklyStat)
        .filter(PlayerWeeklyStat.player_id == player_id, PlayerWeeklyStat.season == season)
        .count()
    )


def compute_trends(current_season: int) -> None:
    db = SessionLocal()
    try:
        players = db.query(Player).filter(Player.sport == "nfl").all()
        for player in players:
            weeks_played = _weeks_played(db, player.id, current_season)
            window = get_stat_window(current_season, weeks_played)
            game_logs = (
                db.query(PlayerWeeklyStat)
                .filter(
                    PlayerWeeklyStat.player_id == player.id,
                    PlayerWeeklyStat.season.in_(window.seasons_included),
                )
                .order_by(PlayerWeeklyStat.season.desc(), PlayerWeeklyStat.week.desc())
                .all()
            )
            if not game_logs:
                continue

            recent_form_games = game_logs[:5]

            for stat_name in STAT_NAMES:
                for threshold in DEFAULT_THRESHOLDS[stat_name]:
                    hits = sum(1 for g in recent_form_games if getattr(g, stat_name) > threshold)
                    signal = (
                        db.query(PlayerTrendSignal)
                        .filter(
                            PlayerTrendSignal.player_id == player.id,
                            PlayerTrendSignal.stat_name == stat_name,
                            PlayerTrendSignal.threshold == threshold,
                        )
                        .one_or_none()
                    )
                    if signal is None:
                        signal = PlayerTrendSignal(
                            sport="nfl", player_id=player.id, stat_name=stat_name, threshold=threshold
                        )
                        db.add(signal)
                    signal.window_mode = window.window_mode
                    signal.recent_form_hits = hits
                    signal.recent_form_games = len(recent_form_games)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    compute_trends(settings.current_season)
