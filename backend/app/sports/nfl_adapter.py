"""NFL adapter: wraps the existing app.etl pipeline behind the SportAdapter contract.

Kept as a thin wrapper (not a physical file move) until a second sport actually
exists — see the multi-sport ADR discussion for why premature splitting is deferred.
"""

import nflreadpy as nfl_data

from ..core.cache import ttl_cache
from ..etl.compute_trends import STAT_NAMES
from ..etl.ingest_schedules import ingest_schedules
from ..etl.run_all import run_all

STAT_ROW_DEFS: list[tuple[str, str, str]] = [
    ("Points Per Game", "points_per_game", "points_per_game_rank"),
    ("Yards Per Game", "yards_per_game", "yards_per_game_rank"),
    ("Time of Possession Per Game", "time_of_possession_seconds_per_game", "time_of_possession_rank"),
    ("Total Def Sacks", "def_sacks_total", "def_sacks_rank"),
    ("Total Def INTs", "def_interceptions_total", "def_interceptions_rank"),
    ("Total Turnover Differential", "turnover_differential_total", "turnover_differential_rank"),
]


@ttl_cache(seconds=3600)
def _cached_current_season() -> int:
    return nfl_data.get_current_season()


@ttl_cache(seconds=3600)
def _cached_current_week() -> int:
    return nfl_data.get_current_week()


class NflAdapter:
    slug = "nfl"
    display_name = "NFL"

    def current_season(self) -> int:
        # nflreadpy tracks the real current NFL season/week — never hardcode this.
        # Cached: nflreadpy has no internal cache for this call and it's slow (~1s).
        return _cached_current_season()

    def current_week(self) -> int:
        return _cached_current_week()

    def ingest_all(self) -> None:
        run_all()

    def refresh_scores(self) -> None:
        ingest_schedules(self.current_season())

    def matchup_stat_rows(self) -> list[tuple[str, str, str]]:
        return STAT_ROW_DEFS

    def trend_stat_names(self) -> list[str]:
        return STAT_NAMES

    def trend_thresholds(self) -> dict[str, list[float]]:
        # Thresholds are computed dynamically per-player now (see
        # compute_trends._fair_threshold) rather than from a static default set.
        return {}


NFL_ADAPTER = NflAdapter()
