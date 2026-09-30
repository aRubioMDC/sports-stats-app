"""Compute Linemate-style hit-rate trend signals per (player, stat, threshold),
using the same small-sample blending rule as team stats.

Preloads all weekly stats up front instead of querying per player/stat/threshold
— see ingest_player_stats.py for why.
"""

import math
from collections import defaultdict

from ..config import settings
from ..db import SessionLocal
from .stat_window import get_stat_window
from ..models import Player, PlayerTrendSignal, PlayerWeeklyStat

STAT_NAMES = ["receptions", "receiving_yards", "rushing_yards", "passing_yards"]
# Lines are placed at a percentile of each player's own recent output, not an
# absolute universal number — a real sportsbook doesn't post the same "74.5
# rush yards" for a starter and a third-stringer. Percentile (not median ± a
# fixed offset) targets a realistic "usually hits, real risk exists" rate —
# e.g. Linemate's real D. Henry 90.5 rush yards line hit 86% (6/7), not 100%.
LINE_PERCENTILES = {
    "value": 0.30,  # ~70% hit rate target
    "safe": 0.12,  # ~88% hit rate target — the safer alt line
}
# A stat only makes sense for certain positions — without this, a WR's
# "passing_yards" would sit at 0 every game, making the "under" version a
# trivial 100%-hit signal that drowns out real ones in the cheatsheet.
RELEVANT_POSITIONS: dict[str, set[str]] = {
    "passing_yards": {"QB"},
    "rushing_yards": {"QB", "RB"},
    "receiving_yards": {"WR", "TE", "RB"},
    "receptions": {"WR", "TE", "RB"},
}


def _fair_threshold(values: list[float], percentile: float) -> float | None:
    """
    A sportsbook-style .5 line placed at a percentile of the player's own
    recent output, so real games land on both sides of it — not a value
    picked from a universal stat menu that's a lock (or impossible) regardless
    of who the player is.

    Requires genuine variance in the sample: a player who puts up the exact
    same number every week doesn't have a meaningful over/under question, no
    matter where the line is drawn (this is what let trivial "under 74.5 rush
    yards" locks slip through for players who never touch the ball).
    """
    if len(values) < 3 or min(values) == max(values):
        return None
    sorted_vals = sorted(values)
    idx = percentile * (len(sorted_vals) - 1)
    lower, upper = math.floor(idx), math.ceil(idx)
    pivot = sorted_vals[lower] if lower == upper else (
        sorted_vals[lower] + (sorted_vals[upper] - sorted_vals[lower]) * (idx - lower)
    )
    if pivot <= 0:
        return None
    return math.floor(pivot) + 0.5


# Below this many total games, there isn't enough history to hold out a
# meaningful test slice, so the stat is skipped entirely (an honest "no
# signal" beats fabricating one from an unreliable split).
MIN_GAMES_FOR_WALK_FORWARD = 10


def _walk_forward_threshold(
    values: list[float], percentile: float
) -> tuple[float, list[float]] | None:
    """
    Sets the threshold using only the OLDER portion of a player's game log,
    then reports hits/misses only against the held-out, more-recent games —
    so the displayed hit rate reflects out-of-sample predictive value instead
    of being fit and graded on the exact same games (curve-fitting bias).

    `values` must be ordered most-recent-first (see compute_trends' query).
    """
    if len(values) < MIN_GAMES_FOR_WALK_FORWARD:
        return None
    holdout = max(3, round(len(values) * 0.3))
    test_values = values[:holdout]  # most recent games — graded on these only
    train_values = values[holdout:]  # older games — used only to set the line
    threshold = _fair_threshold(train_values, percentile)
    if threshold is None:
        return None
    return threshold, test_values


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

        # Thresholds are now computed per-player (see _fair_threshold), so old
        # static-threshold rows are a different key space entirely — wipe and
        # rebuild rather than trying to reconcile against stale rows.
        db.query(PlayerTrendSignal).filter(PlayerTrendSignal.sport == "nfl").delete(synchronize_session=False)
        db.flush()

        for player_index, player in enumerate(players):
            all_logs = logs_by_player.get(player.id, [])
            weeks_played = sum(1 for g in all_logs if g.season == current_season)
            window = get_stat_window(current_season, weeks_played)
            game_logs = [g for g in all_logs if g.season in window.seasons_included]
            if not game_logs:
                continue

            # Linemate-style "hit in N of last N" — N is however many games fall
            # in the stat window (current season, or blended with last season
            # early on), not a fixed slice, so a real 11-game streak reads as
            # 11/11 instead of being truncated to a fake 5/5.
            recent_form_games = game_logs

            for stat_name in STAT_NAMES:
                if player.position not in RELEVANT_POSITIONS[stat_name]:
                    continue
                values = [getattr(g, stat_name) for g in recent_form_games]
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
                                sport="nfl",
                                player_id=player.id,
                                stat_name=stat_name,
                                threshold=threshold,
                                direction=direction,
                                window_mode=window.window_mode,
                                recent_form_hits=hits,
                                recent_form_games=len(test_values),
                            )
                        )

            # Flush in small batches instead of one huge commit at the end —
            # Supabase's pooled connection enforces a per-statement timeout,
            # and a single executemany covering thousands of rows exceeds it.
            if player_index % 100 == 99:
                db.flush()
        db.commit()
    finally:

        db.close()


if __name__ == "__main__":
    import nflreadpy as nfl_data

    compute_trends(nfl_data.get_current_season())
