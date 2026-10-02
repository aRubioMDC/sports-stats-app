"""Thin httpx wrapper around the free, public NHL API (api-web.nhle.com) — no API
key required. Every field consumed by the NHL ETL modules was verified against
live responses before being relied on here.
"""

import httpx
from datetime import date, timedelta
from functools import lru_cache

BASE_URL = "https://api-web.nhle.com/v1"
_TIMEOUT = 20.0


def get_standings_now() -> list[dict]:
    """Real-time team standings: record, points, goals for/against, conference/division."""
    resp = httpx.get(f"{BASE_URL}/standings/now", timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()["standings"]


def get_standings_on(day: str) -> list[dict]:
    """Standings as of `day` (YYYY-MM-DD); empty once the regular season is over."""
    resp = httpx.get(f"{BASE_URL}/standings/{day}", timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()["standings"]


@lru_cache(maxsize=4)
def get_final_standings(season: int) -> list[dict]:
    """Last real regular-season standings of a finished season (dual-year id, e.g. 20252026).
    The API returns nothing for dates after the last regular-season day, so walk back from April 30."""
    day = date(season % 10000, 4, 30)
    for _ in range(31):
        standings = get_standings_on(day.isoformat())
        if standings and standings[0].get("seasonId") == season:
            return standings
        day -= timedelta(days=1)
    return []


def get_schedule(date: str) -> dict:
    """`date` is YYYY-MM-DD (or "now"). Returns the raw payload, including
    gameWeek[].games[] and a `nextStartDate` cursor for forward pagination."""
    resp = httpx.get(f"{BASE_URL}/schedule/{date}", timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


def get_roster(team_abbrev: str) -> dict:
    """Current roster for a team: forwards/defensemen/goalies arrays."""
    resp = httpx.get(f"{BASE_URL}/roster/{team_abbrev}/current", timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()


def get_player_game_log(player_id: int, season: int, game_type: int = 2) -> list[dict]:
    """`game_type` 2 = regular season, 3 = playoffs. Returns gameLog[] (may be empty
    for a player with no games yet this season)."""
    resp = httpx.get(
        f"{BASE_URL}/player/{player_id}/game-log/{season}/{game_type}", timeout=_TIMEOUT, follow_redirects=True
    )
    resp.raise_for_status()
    return resp.json().get("gameLog", [])
