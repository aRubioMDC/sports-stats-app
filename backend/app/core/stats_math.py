"""Shared statistical helpers for expressing hit-rate uncertainty honestly."""

import math


def wilson_interval(hits: int, games: int, z: float = 1.96) -> tuple[float, float]:
    """
    95% (default z=1.96) Wilson score confidence interval for a binomial hit
    rate. Preferred over a normal approximation here because several signals
    have single-digit sample sizes, where the normal approximation can produce
    nonsensical bounds (e.g. below 0% or above 100%).
    """
    if games <= 0:
        return (0.0, 0.0)
    p = hits / games
    denom = 1 + z ** 2 / games
    center = p + z ** 2 / (2 * games)
    margin = z * math.sqrt((p * (1 - p) + z ** 2 / (4 * games)) / games)
    low = (center - margin) / denom
    high = (center + margin) / denom
    return (max(0.0, low), min(1.0, high))
