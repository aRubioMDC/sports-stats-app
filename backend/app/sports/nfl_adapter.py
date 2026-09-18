"""NFL adapter: wraps the existing app.etl pipeline behind the SportAdapter contract.

Kept as a thin wrapper (not a physical file move) until a second sport actually
exists — see the multi-sport ADR discussion for why premature splitting is deferred.
"""

import nflreadpy as nfl_data

from app.etl.compute_trends import DEFAULT_THRESHOLDS, STAT_NAMES
from app.etl.ingest_schedules import ingest_schedules
from app.etl.run_all import run_all

STAT_ROW_DEFS: list[tuple[str, str, str]] = [
    ("Points Per Game", "points_per_game", "points_per_game_rank"),
    ("Yards Per Game", "yards_per_game", "yards_per_game_rank"),
    ("Time of Possession Per Game", "time_of_possession_seconds_per_game", "time_of_possession_rank"),
    ("Total Def Sacks", "def_sacks_total", "def_sacks_rank"),
    ("Total Def INTs", "def_interceptions_total", "def_interceptions_rank"),
    ("Total Turnover Differential", "turnover_differential_total", "turnover_differential_rank"),
]


class NflAdapter:
    slug = "nfl"
    display_name = "NFL"

    def current_season(self) -> int:
        # nflreadpy tracks the real current NFL season/week — never hardcode this.
        return nfl_data.get_current_season()

    def current_week(self) -> int:
        return nfl_data.get_current_week()

    def ingest_all(self) -> None:
        run_all()

    def refresh_scores(self) -> None:
        ingest_schedules(self.current_season())

    def matchup_stat_rows(self) -> list[tuple[str, str, str]]:
        return STAT_ROW_DEFS

    def trend_stat_names(self) -> list[str]:
        return STAT_NAMES

    def trend_thresholds(self) -> dict[str, list[float]]:
        return DEFAULT_THRESHOLDS


NFL_ADAPTER = NflAdapter()
