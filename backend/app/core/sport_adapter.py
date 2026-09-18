"""Contract every sport/league module must implement to plug into the shared
API, ETL scheduler, and matchup/trend engine.
"""

from typing import Protocol


class SportAdapter(Protocol):
    slug: str  # url/db discriminator, e.g. "nfl", "nba"
    display_name: str

    def current_season(self) -> int:
        """The season currently in progress, determined dynamically (never hardcoded)."""
        ...

    def current_week(self) -> int:
        """The week currently in progress, determined dynamically (never hardcoded)."""
        ...

    def ingest_all(self) -> None:
        """Run this sport's full ETL pipeline (schedules, stats, trends, odds)."""
        ...

    def refresh_scores(self) -> None:
        """Cheap, frequent refresh of just kickoff/score/status — no stat rollups."""
        ...

    def matchup_stat_rows(self) -> list[tuple[str, str, str]]:
        """Ordered (label, value_field, rank_field) rows for the matchup comparison card."""
        ...

    def trend_stat_names(self) -> list[str]:
        """Player stat fields tracked for hit-rate trend signals."""
        ...

    def trend_thresholds(self) -> dict[str, list[float]]:
        """Default over/under thresholds per stat, used to seed the cheatsheet."""
        ...
