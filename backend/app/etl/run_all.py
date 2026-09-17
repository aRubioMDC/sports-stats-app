"""Run the full ETL pipeline in dependency order. Invoked by Railway cron or locally."""

from app.config import settings
from app.etl.compute_trends import compute_trends
from app.etl.ingest_odds import ingest_odds
from app.etl.ingest_player_stats import ingest_player_stats
from app.etl.ingest_schedules import ingest_schedules
from app.etl.ingest_team_stats import ingest_team_stats


def run_all() -> None:
    season = settings.current_season
    ingest_schedules(season)
    ingest_player_stats([season - 1, season])
    ingest_team_stats(season)
    compute_trends(season)
    ingest_odds()


if __name__ == "__main__":
    run_all()
