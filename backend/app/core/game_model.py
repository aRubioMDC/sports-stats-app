"""Pure statistical model for a single game: expected scoring, win probability and derived markets.

Team strengths are attack/defense ratios built from real final scores and shrunk toward the
league average when the sample is small. Margin and total are modelled as normal distributions
whose spread is the league's empirical spread, which is deliberately conservative (wider
distributions pull probabilities toward 50%, never toward false certainty).
"""

from __future__ import annotations

import math
from dataclasses import dataclass

MIN_LEAGUE_GAMES = 20
# Heuristic: a team's observed scoring counts like this many league-average games of evidence.
PRIOR_GAMES = 8.0
LOW_SAMPLE_TEAM_GAMES = 4.0
# Presentation floor/ceiling so the UI never claims a 0% or 100% outcome.
PROB_FLOOR = 0.005
PROB_CEIL = 0.995

# Margin-of-victory buckets, inclusive in points: (low, high) with None meaning "or more".
MARGIN_BUCKETS: list[tuple[int, int | None]] = [(1, 3), (4, 7), (8, 14), (15, None)]
SPREAD_HOME_LINES = [-10.5, -7.5, -3.5, -0.5, 0.5, 3.5, 7.5, 10.5]
LINE_STEP = 3.0
LINE_OFFSETS = [-2, -1, 0, 1, 2]


@dataclass(frozen=True)
class GameResult:
    home_id: int
    away_id: int
    home_score: int
    away_score: int
    weight: float = 1.0


@dataclass(frozen=True)
class TeamRating:
    for_avg: float
    against_avg: float
    games: float  # weighted games behind the averages


@dataclass(frozen=True)
class LeagueScoring:
    home_avg: float
    away_avg: float
    margin_sd: float
    total_sd: float
    team_sd: float
    games: float

    @property
    def team_avg(self) -> float:
        return (self.home_avg + self.away_avg) / 2


def clamp_prob(p: float) -> float:
    return min(PROB_CEIL, max(PROB_FLOOR, p))


def normal_cdf(x: float, mean: float, sd: float) -> float:
    if sd <= 0:
        return 1.0 if x >= mean else 0.0
    return 0.5 * (1.0 + math.erf((x - mean) / (sd * math.sqrt(2.0))))


def _weighted_mean(values: list[float], weights: list[float]) -> float:
    total = sum(weights)
    return sum(v * w for v, w in zip(values, weights)) / total if total else 0.0


def _weighted_sd(values: list[float], weights: list[float], mean: float) -> float:
    total = sum(weights)
    if total <= 0:
        return 0.0
    return math.sqrt(sum(w * (v - mean) ** 2 for v, w in zip(values, weights)) / total)


def league_scoring(results: list[GameResult]) -> LeagueScoring | None:
    """League-wide scoring profile; None when there is too little real data to trust."""
    total_weight = sum(r.weight for r in results)
    if len(results) < MIN_LEAGUE_GAMES or total_weight <= 0:
        return None

    weights = [r.weight for r in results]
    home_scores = [float(r.home_score) for r in results]
    away_scores = [float(r.away_score) for r in results]
    margins = [h - a for h, a in zip(home_scores, away_scores)]
    totals = [h + a for h, a in zip(home_scores, away_scores)]

    home_avg = _weighted_mean(home_scores, weights)
    away_avg = _weighted_mean(away_scores, weights)
    margin_sd = _weighted_sd(margins, weights, _weighted_mean(margins, weights))
    total_sd = _weighted_sd(totals, weights, _weighted_mean(totals, weights))
    home_var = _weighted_sd(home_scores, weights, home_avg) ** 2
    away_var = _weighted_sd(away_scores, weights, away_avg) ** 2

    return LeagueScoring(
        home_avg=home_avg,
        away_avg=away_avg,
        margin_sd=margin_sd,
        total_sd=total_sd,
        team_sd=math.sqrt((home_var + away_var) / 2),
        games=total_weight,
    )


def team_rating(results: list[GameResult], team_id: int) -> TeamRating | None:
    scored: list[float] = []
    allowed: list[float] = []
    weights: list[float] = []
    for r in results:
        if r.home_id == team_id:
            scored.append(float(r.home_score))
            allowed.append(float(r.away_score))
        elif r.away_id == team_id:
            scored.append(float(r.away_score))
            allowed.append(float(r.home_score))
        else:
            continue
        weights.append(r.weight)
    if not weights:
        return None
    return TeamRating(
        for_avg=_weighted_mean(scored, weights),
        against_avg=_weighted_mean(allowed, weights),
        games=sum(weights),
    )


def _shrink(observed: float, games: float, league_avg: float, prior_games: float) -> float:
    return (games * observed + prior_games * league_avg) / (games + prior_games)


def project_points(
    home: TeamRating | None,
    away: TeamRating | None,
    league: LeagueScoring,
    prior_games: float = PRIOR_GAMES,
) -> tuple[float, float]:
    """Expected points for (home, away): league side average x own attack x opponent defense."""
    base = league.team_avg
    if base <= 0:
        return league.home_avg, league.away_avg

    def attack(r: TeamRating | None) -> float:
        return _shrink(r.for_avg, r.games, base, prior_games) / base if r else 1.0

    def leakiness(r: TeamRating | None) -> float:
        return _shrink(r.against_avg, r.games, base, prior_games) / base if r else 1.0

    return (
        league.home_avg * attack(home) * leakiness(away),
        league.away_avg * attack(away) * leakiness(home),
    )


def win_probabilities(mean_margin: float, margin_sd: float) -> tuple[float, float]:
    """(home, away) over decided games, matching how a refunded-on-tie moneyline is priced."""
    home_raw = 1.0 - normal_cdf(0.5, mean_margin, margin_sd)
    away_raw = normal_cdf(-0.5, mean_margin, margin_sd)
    decided = home_raw + away_raw
    if decided <= 0:
        return 0.5, 0.5
    return clamp_prob(home_raw / decided), clamp_prob(away_raw / decided)


def margin_bucket_probs(mean_margin: float, margin_sd: float) -> list[tuple[str, float, float]]:
    """(label, home wins by this much, away wins by this much), normalized over decided games."""
    raw: list[tuple[str, float, float]] = []
    for low, high in MARGIN_BUCKETS:
        if high is None:
            label = f"{low}+"
            home = 1.0 - normal_cdf(low - 0.5, mean_margin, margin_sd)
            away = normal_cdf(-(low - 0.5), mean_margin, margin_sd)
        else:
            label = f"{low}-{high}"
            home = normal_cdf(high + 0.5, mean_margin, margin_sd) - normal_cdf(low - 0.5, mean_margin, margin_sd)
            away = normal_cdf(-(low - 0.5), mean_margin, margin_sd) - normal_cdf(-(high + 0.5), mean_margin, margin_sd)
        raw.append((label, home, away))

    decided = sum(h + a for _, h, a in raw)
    if decided <= 0:
        return [(label, PROB_FLOOR, PROB_FLOOR) for label, _, _ in raw]
    return [(label, clamp_prob(h / decided), clamp_prob(a / decided)) for label, h, a in raw]


def half_point_lines(center: float, step: float = LINE_STEP, offsets: list[int] | None = None) -> list[float]:
    """Half-point lines (no pushes) spaced around the half-point nearest to `center`."""
    anchor = math.floor(center) + 0.5
    return [anchor + step * k for k in (offsets if offsets is not None else LINE_OFFSETS) if anchor + step * k > 0]


def over_under(mean: float, sd: float, lines: list[float]) -> list[tuple[float, float, float]]:
    """(line, P(over), P(under)) for half-point lines."""
    out: list[tuple[float, float, float]] = []
    for line in lines:
        over = clamp_prob(1.0 - normal_cdf(line, mean, sd))
        out.append((line, over, clamp_prob(1.0 - over)))
    return out


def spread_cover(mean_margin: float, margin_sd: float, home_lines: list[float]) -> list[tuple[float, float, float]]:
    """(home spread, P(home covers), P(away covers)); home covers when margin + spread > 0."""
    out: list[tuple[float, float, float]] = []
    for spread in home_lines:
        home = clamp_prob(1.0 - normal_cdf(-spread, mean_margin, margin_sd))
        out.append((spread, home, clamp_prob(1.0 - home)))
    return out
