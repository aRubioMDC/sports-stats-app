"""Pure scoring metrics for judging probabilistic predictions against what really happened."""

from __future__ import annotations

import math
from dataclasses import dataclass

LOG_LOSS_EPS = 1e-6


@dataclass(frozen=True)
class CalibrationBin:
    low: float
    high: float
    count: int
    mean_predicted: float
    observed_rate: float


def brier_score(probs: list[float], outcomes: list[bool]) -> float:
    """Mean squared error of the probabilities (0 is perfect, 0.25 is a constant 50/50)."""
    _require_same_length(probs, outcomes)
    return sum((p - float(o)) ** 2 for p, o in zip(probs, outcomes)) / len(probs)


def log_loss(probs: list[float], outcomes: list[bool]) -> float:
    """Mean negative log-likelihood; punishes confident misses much harder than Brier does."""
    _require_same_length(probs, outcomes)
    total = 0.0
    for p, o in zip(probs, outcomes):
        p = min(1 - LOG_LOSS_EPS, max(LOG_LOSS_EPS, p))
        total -= math.log(p if o else 1 - p)
    return total / len(probs)


def mean_absolute_error(predicted: list[float], actual: list[float]) -> float:
    _require_same_length(predicted, actual)
    return sum(abs(p - a) for p, a in zip(predicted, actual)) / len(predicted)


def calibration_bins(probs: list[float], outcomes: list[bool], bins: int = 10) -> list[CalibrationBin]:
    """Groups predictions into equal-width probability bins (empty bins are left out)."""
    _require_same_length(probs, outcomes)
    grouped: list[list[tuple[float, bool]]] = [[] for _ in range(bins)]
    for p, o in zip(probs, outcomes):
        grouped[min(bins - 1, int(p * bins))].append((p, o))

    result = []
    for index, rows in enumerate(grouped):
        if not rows:
            continue
        result.append(
            CalibrationBin(
                low=index / bins,
                high=(index + 1) / bins,
                count=len(rows),
                mean_predicted=sum(p for p, _ in rows) / len(rows),
                observed_rate=sum(o for _, o in rows) / len(rows),
            )
        )
    return result


def _require_same_length(left: list, right: list) -> None:
    if len(left) != len(right):
        raise ValueError("predictions and outcomes must have the same length")
    if not left:
        raise ValueError("at least one prediction is required")
