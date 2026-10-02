"""NHL adapter: wraps app.etl's NHL pipeline behind the SportAdapter contract —
the second sport proving out the multi-sport architecture.

Odds ingestion is intentionally not wired up for NHL yet (team-name matching
and market keys would need their own NHL-specific pass) — real trend signals
from actual game logs are still fully live.
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from ..core.cache import ttl_cache
from ..core.constants import CACHE_TTL_LONG
from ..etl.compute_trends_nhl import STAT_NAMES
from ..etl.ingest_schedules_nhl import _week_number, ingest_schedule_nhl, season_anchor_date
from ..etl.run_all_nhl import current_nhl_season, run_all_nhl

APP_TIMEZONE = ZoneInfo("America/Mexico_City")

STAT_ROW_DEFS: list[tuple[str, str, str]] = [
    ("Points Percentage", "points_per_game", "points_per_game_rank"),
    ("Goals For Per Game", "yards_per_game", "yards_per_game_rank"),
    ("Goal Differential Per Game", "time_of_possession_seconds_per_game", "time_of_possession_rank"),
    ("Win Percentage", "def_sacks_total", "def_sacks_rank"),
]


@ttl_cache(seconds=CACHE_TTL_LONG)
def _cached_current_season() -> int:
    return current_nhl_season()


class NhlAdapter:
    slug = "nhl"
    display_name = "NHL"
    period_unit = "day"  # hockey has no real "week" — games run nearly daily

    def current_season(self) -> int:
        # Real, authoritative season id from the standings API — never hardcoded.
        # Cached: it's a network call and the season only changes once a year.
        return _cached_current_season()

    def current_week(self) -> int:
        # The real day-of-season index (see period_anchor_date) — the frontend
        # turns this back into an actual calendar date for display.
        local_today = datetime.now(timezone.utc).astimezone(APP_TIMEZONE).date()
        return _week_number(local_today, self.current_season())

    def previous_season(self, season: int) -> int:
        return season - 10001  # 20262027 -> 20252026, not season - 1 (== 20262026, not a real season)

    def period_anchor_date(self) -> str | None:
        return season_anchor_date(self.current_season()).isoformat()

    def ingest_all(self) -> None:
        run_all_nhl()

    def refresh_scores(self) -> None:
        # Cheap/frequent path — anchor on the local calendar day so we keep the
        # full "today" slate (not just future-only slices from a moving "now"
        # cursor), which is what users expect on Home.
        local_today = datetime.now(timezone.utc).astimezone(APP_TIMEZONE).date().isoformat()
        ingest_schedule_nhl(start_date=local_today, max_pages=2)

    def matchup_stat_rows(self) -> list[tuple[str, str, str]]:
        return STAT_ROW_DEFS

    def trend_stat_names(self) -> list[str]:
        return STAT_NAMES

    def trend_thresholds(self) -> dict[str, list[float]]:
        # Thresholds are computed dynamically per-player (see compute_trends_nhl).
        return {}

    def market_thresholds(self) -> dict[str, list[float]]:
        return {
            "team_points": [3.5, 2.5, 1.5, 0.5],
            "game_total_points": [6.5, 5.5, 4.5, 3.5],
        }


NHL_ADAPTER = NhlAdapter()
