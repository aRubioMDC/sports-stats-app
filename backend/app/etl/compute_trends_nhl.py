"""Compute Linemate-style hit-rate trend signals for NHL skaters, reusing the
same walk-forward threshold math as compute_trends.py (see that module for the
full methodology notes) — the NHL counterpart of compute_trends.py.

Unlike NFL, every stat here applies to every skater position (forwards and
defensemen all record goals/assists/points/shots), so there's no position-relevance
filter to apply.
"""

from collections import defaultdict

from ..db import SessionLocal
from ..models import HockeyPlayerGameStat, Player, PlayerTrendSignal
from .compute_trends import LINE_PERCENTILES, _walk_forward_threshold
from .stat_window import get_stat_window

STAT_NAMES = ["goals", "assists", "points", "shots_on_goal"]


def compute_trends_nhl(current_season: int) -> None:
    db = SessionLocal()
    try:
        players = db.query(Player).filter(Player.sport == "nhl").all()

        logs_by_player: dict[int, list[HockeyPlayerGameStat]] = defaultdict(list)
        for stat in (
            db.query(HockeyPlayerGameStat)
            .join(Player)
            .filter(Player.sport == "nhl")
            .order_by(HockeyPlayerGameStat.season.desc(), HockeyPlayerGameStat.game_date.desc())
            .all()
        ):
            logs_by_player[stat.player_id].append(stat)

        db.query(PlayerTrendSignal).filter(PlayerTrendSignal.sport == "nhl").delete(synchronize_session=False)
        db.flush()

        for player_index, player in enumerate(players):
            all_logs = logs_by_player.get(player.id, [])
            games_played = sum(1 for g in all_logs if g.season == current_season)
            # NHL season ids are dual-year (20262027), so the previous season is
            # current_season - 10001 (20252026), not current_season - 1.
            window = get_stat_window(current_season, games_played, current_season - 10001)
            game_logs = [g for g in all_logs if g.season in window.seasons_included]
            if not game_logs:
                continue

            for stat_name in STAT_NAMES:
                values = [getattr(g, stat_name) for g in game_logs]
                seen_thresholds: set[float] = set()
                for percentile in LINE_PERCENTILES.values():
                    split = _walk_forward_threshold(values, percentile)
                    if split is None:
                        continue
                    threshold, test_values = split
                    if threshold in seen_thresholds:
                        continue
                    seen_thresholds.add(threshold)
                    for direction in ("over", "under"):
                        if direction == "over":
                            hits = sum(1 for v in test_values if v > threshold)
                        else:
                            hits = sum(1 for v in test_values if v < threshold)
                        db.add(
                            PlayerTrendSignal(
                                sport="nhl",
                                player_id=player.id,
                                stat_name=stat_name,
                                threshold=threshold,
                                direction=direction,
                                window_mode=window.window_mode,
                                recent_form_hits=hits,
                                recent_form_games=len(test_values),
                            )
                        )
            if player_index % 100 == 99:
                db.flush()
        db.commit()
    finally:
        db.close()
