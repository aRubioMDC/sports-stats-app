"""Contract every sport/league module must implement to plug into the shared
API, ETL scheduler, and matchup/trend engine.
"""

from typing import Protocol


class SportAdapter(Protocol):
    slug: str  # url/db discriminator, e.g. "nfl", "nba"
    display_name: str
    # "week" for sports with a real discrete week (NFL); "day" for sports that
    # schedule nearly daily with no native week concept (NHL) — Game.week still
    # stores an integer bucket either way, but the frontend renders/navigates it
    # as a real calendar date instead of "Week N" when this is "day".
    period_unit: str

    def current_season(self) -> int:
        """The season currently in progress, determined dynamically (never hardcoded)."""
        ...

    def current_week(self) -> int:
        """The week currently in progress, determined dynamically (never hardcoded)."""
        ...

    def previous_season(self, season: int) -> int:
        """The season identifier immediately before `season` — NOT always `season - 1`:
        NHL uses dual-year ids (20262027 -> 20252026, a difference of 10001)."""
        ...

    def period_anchor_date(self) -> str | None:
        """ISO date such that week N == this date + N days — only meaningful (non-None)
        when period_unit == "day"; lets the frontend turn a week bucket into a real date."""
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

    def market_thresholds(self) -> dict[str, list[float]]:
        """Default market-style thresholds for team totals and game totals."""
        ...
