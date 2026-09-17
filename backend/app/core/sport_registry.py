"""Registry of active sport adapters, keyed by URL/DB slug."""

from app.core.sport_adapter import SportAdapter
from app.sports.nfl_adapter import NFL_ADAPTER

SPORTS: dict[str, SportAdapter] = {
    "nfl": NFL_ADAPTER,
}


def get_sport(slug: str) -> SportAdapter:
    try:
        return SPORTS[slug]
    except KeyError:
        raise ValueError(f"Unknown sport '{slug}'. Available: {list(SPORTS)}") from None
