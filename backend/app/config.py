from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Find .env file at project root (one level up from backend directory)
env_file = Path(__file__).parent.parent.parent / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(env_file), extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/nfl_stats"
    db_pool_size: int = 5
    db_max_overflow: int = 5
    db_pool_timeout: int = 30
    db_pool_recycle_seconds: int = 1800
    odds_api_key: str = ""
    odds_api_base_url: str = "https://api.the-odds-api.com/v4"
    small_sample_week_threshold: int = 4
    # NHL plays 82 games, so the same small-sample cutoff needs far more games than the NFL's 17.
    small_sample_games_threshold_nhl: int = 20
    cors_origins: str = "http://localhost:5174,http://localhost:4174,http://127.0.0.1:5174,http://127.0.0.1:4174"
    frontend_dist_dir: str = "../frontend/dist"
    # False = serve immediately and run the startup ETL in the background (dev).
    etl_blocking_startup: bool = True


settings = Settings()
