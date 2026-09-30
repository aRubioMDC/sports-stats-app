from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# Find .env file at project root (one level up from backend directory)
env_file = Path(__file__).parent.parent.parent / ".env"

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(env_file), extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/nfl_stats"
    odds_api_key: str = ""
    odds_api_base_url: str = "https://api.the-odds-api.com/v4"
    small_sample_week_threshold: int = 4
    frontend_dist_dir: str = "../frontend/dist"


settings = Settings()
