"""Compute Linemate-style hit-rate trend signals per (player, stat, threshold),
using the same small-sample blending rule as team stats.

Preloads all weekly stats and existing trend signals up front instead of
querying per player/stat/threshold — see ingest_player_stats.py for why.
"""

from collections import defaultdict

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


def compute_trends(current_season: int) -> None:
    db = SessionLocal()
    try:
        players = db.query(Player).filter(Player.sport == "nfl").all()

        logs_by_player: dict[int, list[PlayerWeeklyStat]] = defaultdict(list)
        for stat in (
            db.query(PlayerWeeklyStat)
            .join(Player)
            .filter(Player.sport == "nfl")
            .order_by(PlayerWeeklyStat.season.desc(), PlayerWeeklyStat.week.desc())
            .all()
        ):
            logs_by_player[stat.player_id].append(stat)

        existing_signals = {
            (s.player_id, s.stat_name, s.threshold): s
            for s in db.query(PlayerTrendSignal).filter(PlayerTrendSignal.sport == "nfl").all()
        }

        for player in players:
            all_logs = logs_by_player.get(player.id, [])
            weeks_played = sum(1 for g in all_logs if g.season == current_season)
            window = get_stat_window(current_season, weeks_played)
            game_logs = [g for g in all_logs if g.season in window.seasons_included]
            if not game_logs:
                continue

            recent_form_games = game_logs[:5]

            for stat_name in STAT_NAMES:
                for threshold in DEFAULT_THRESHOLDS[stat_name]:
                    hits = sum(1 for g in recent_form_games if getattr(g, stat_name) > threshold)
                    signal_key = (player.id, stat_name, threshold)
                    signal = existing_signals.get(signal_key)
                    if signal is None:
                        signal = PlayerTrendSignal(
                            sport="nfl", player_id=player.id, stat_name=stat_name, threshold=threshold
                        )
                        db.add(signal)
                        existing_signals[signal_key] = signal
                    signal.window_mode = window.window_mode
                    signal.recent_form_hits = hits
                    signal.recent_form_games = len(recent_form_games)
        db.commit()
    finally:

        db.close()


if __name__ == "__main__":
    compute_trends(settings.current_season)
