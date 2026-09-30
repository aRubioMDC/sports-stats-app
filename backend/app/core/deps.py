from fastapi import HTTPException, Path

from .sport_registry import SPORTS


def valid_sport(sport: str = Path(...)) -> str:
    if sport not in SPORTS:
        raise HTTPException(status_code=404, detail=f"Unknown sport '{sport}'")
    return sport
