"""Pure statistical model for an NHL game: goals per team are independent Poisson counts.

Expected goals come from the same attack/defense ratings used for football (see game_model).
Hockey has no ties, so a game tied after regulation is settled in overtime/shootout, which is
treated as a near coin flip: a team's relative strength only counts for part of the edge.
"""

from __future__ import annotations

import math

from .game_model import clamp_prob, half_point_lines

# Heuristic: goals are noisy, so a team's scoring record counts like this many league-average
# games of evidence (football uses less because its scoring is less random per game).
PRIOR_GAMES = 30.0
MAX_GOALS = 30
# Share of the strength edge that carries into overtime/shootout (0 = pure coin flip).
OT_STRENGTH_WEIGHT = 0.5

TOTAL_LINE_STEP = 1.0
TOTAL_LINE_OFFSETS = [-2, -1, 0, 1, 2]
TEAM_LINE_OFFSETS = [-1, 0, 1]
PUCK_HOME_LINES = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5]
# Margin bands in goals for the final result (an OT/shootout win counts as a 1-goal win).
MARGIN_LABELS = ["1", "2", "3+"]


def poisson_pmf(mean: float, max_goals: int = MAX_GOALS) -> list[float]:
    """P(X = k) for k in 0..max_goals, renormalised so the truncated tail does not leak mass."""
    mean = max(mean, 1e-9)
    probs = [math.exp(-mean)]
    for k in range(1, max_goals + 1):
        probs.append(probs[-1] * mean / k)
    total = sum(probs)
    return [p / total for p in probs]


def poisson_over(mean: float, line: float) -> float:
    """P(X > line) for a half-point line."""
    pmf = poisson_pmf(mean)
    return sum(p for k, p in enumerate(pmf) if k > line)


def final_margin_distribution(mu_home: float, mu_away: float) -> dict[int, float]:
    """P(home goals - away goals = d) for the final result, with ties settled in OT/shootout."""
    pmf_home = poisson_pmf(mu_home)
    pmf_away = poisson_pmf(mu_away)
    strength = mu_home / (mu_home + mu_away) if mu_home + mu_away > 0 else 0.5
    home_ot = 0.5 + OT_STRENGTH_WEIGHT * (strength - 0.5)

    dist: dict[int, float] = {}
    for home_goals, p_home in enumerate(pmf_home):
        for away_goals, p_away in enumerate(pmf_away):
            p = p_home * p_away
            margin = home_goals - away_goals
            if margin == 0:
                dist[1] = dist.get(1, 0.0) + p * home_ot
                dist[-1] = dist.get(-1, 0.0) + p * (1.0 - home_ot)
            else:
                dist[margin] = dist.get(margin, 0.0) + p
    return dist


def win_probabilities(dist: dict[int, float]) -> tuple[float, float]:
    home = sum(p for d, p in dist.items() if d > 0)
    away = sum(p for d, p in dist.items() if d < 0)
    decided = home + away
    if decided <= 0:
        return 0.5, 0.5
    return clamp_prob(home / decided), clamp_prob(away / decided)


def margin_bucket_probs(dist: dict[int, float]) -> list[tuple[str, float, float]]:
    """(label, home wins by this many goals, away wins by this many goals)."""

    def band(label: str, margin: int) -> bool:
        return margin >= 3 if label == "3+" else margin == int(label)

    raw = [
        (
            label,
            sum(p for d, p in dist.items() if d > 0 and band(label, d)),
            sum(p for d, p in dist.items() if d < 0 and band(label, -d)),
        )
        for label in MARGIN_LABELS
    ]
    decided = sum(h + a for _, h, a in raw)
    if decided <= 0:
        return [(label, 0.0, 0.0) for label, _, _ in raw]
    return [(label, clamp_prob(h / decided), clamp_prob(a / decided)) for label, h, a in raw]


def total_lines(mean_total: float) -> list[float]:
    return half_point_lines(mean_total, TOTAL_LINE_STEP, TOTAL_LINE_OFFSETS)


def team_lines(mean: float) -> list[float]:
    return half_point_lines(mean, TOTAL_LINE_STEP, TEAM_LINE_OFFSETS)


def over_under(mean: float, lines: list[float]) -> list[tuple[float, float, float]]:
    """(line, P(over), P(under)) for half-point goal lines."""
    out: list[tuple[float, float, float]] = []
    for line in lines:
        over = clamp_prob(poisson_over(mean, line))
        out.append((line, over, clamp_prob(1.0 - over)))
    return out


def spread_cover(dist: dict[int, float], home_lines: list[float]) -> list[tuple[float, float, float]]:
    """(home puck line, P(home covers), P(away covers)); home covers when margin + line > 0."""
    out: list[tuple[float, float, float]] = []
    for line in home_lines:
        home = clamp_prob(sum(p for d, p in dist.items() if d + line > 0))
        out.append((line, home, clamp_prob(1.0 - home)))
    return out
