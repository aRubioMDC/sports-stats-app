"""Run the full ETL pipeline in dependency order. Invoked by Railway cron or locally."""

import nflreadpy as nfl_data

from .compute_trends import compute_trends
from .ingest_odds import ingest_odds, ingest_player_prop_odds
from .ingest_player_stats import ingest_player_stats
from .ingest_schedules import ingest_historical_schedules, ingest_schedules
from .ingest_team_stats import ingest_team_stats


def run_all() -> None:
    # Determined dynamically every run — never hardcode the season.
    season = nfl_data.get_current_season()
    ingest_schedules(season)
    # Real final scores for older seasons — only used as a head-to-head fallback
    # when two teams haven't met in the last season or two; never fabricated.
    ingest_historical_schedules(list(range(season - 8, season - 1)))
    ingest_player_stats([season - 1, season])
    ingest_team_stats(season)
    compute_trends(season)
    ingest_odds()
    ingest_player_prop_odds()


if __name__ == "__main__":
    run_all()
