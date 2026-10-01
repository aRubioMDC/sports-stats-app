"""Run the NHL ETL pipeline in dependency order — the NHL counterpart of run_all.py.

Odds/player-props ingestion is intentionally not included yet (scoped out for
this first pass — see the NHL adapter for why).
"""

from .compute_trends_nhl import compute_trends_nhl
from .ingest_player_stats_nhl import ingest_player_stats_nhl
from .ingest_schedules_nhl import ingest_schedule_nhl
from .ingest_team_stats_nhl import ingest_team_stats_nhl
from .nhl_client import get_standings_now


def current_nhl_season() -> int:
    # The standings API's seasonId is the real, authoritative current season —
    # never hardcoded or date-guessed.
    return int(get_standings_now()[0]["seasonId"])


def run_all_nhl() -> None:
    season = current_nhl_season()
    ingest_schedule_nhl()
    ingest_player_stats_nhl(season)
    ingest_team_stats_nhl(season)
    compute_trends_nhl(season)


if __name__ == "__main__":
    run_all_nhl()
