"""Thin httpx wrapper around the free, public NHL API (api-web.nhle.com) — no API
key required. Every field consumed by the NHL ETL modules was verified against
live responses before being relied on here.
"""

import httpx

BASE_URL = "https://api-web.nhle.com/v1"
_TIMEOUT = 20.0


def get_standings_now() -> list[dict]:
    """Real-time team standings: record, points, goals for/against, conference/division."""
    resp = httpx.get(f"{BASE_URL}/standings/now", timeout=_TIMEOUT, follow_redirects=True)
    resp.raise_for_status()
    return resp.json()["standings"]


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
