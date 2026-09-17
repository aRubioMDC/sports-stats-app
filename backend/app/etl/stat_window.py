"""Shared rule for choosing which games feed team/player rolling stats.

Business rule: if a team (or player) has played <= `small_sample_week_threshold`
games in the current season, pool ALL of last season's games together with the
current season's games played so far (not last season alone, and not just the
few current-season games alone). Once past the threshold, use current season only.
"""

from dataclasses import dataclass

from app.config import settings


@dataclass
class StatWindow:
    season: int
    weeks_played: int
    window_mode: str  # "blended" | "current"
    seasons_included: list[int]


def get_stat_window(current_season: int, weeks_played_current_season: int) -> StatWindow:
    if weeks_played_current_season <= settings.small_sample_week_threshold:
        return StatWindow(
            season=current_season,
            weeks_played=weeks_played_current_season,
            window_mode="blended",
            seasons_included=[current_season - 1, current_season],
        )
    return StatWindow(
        season=current_season,
        weeks_played=weeks_played_current_season,
        window_mode="current",
        seasons_included=[current_season],
    )
