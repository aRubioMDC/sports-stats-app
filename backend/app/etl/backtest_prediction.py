"""Offline backtest of the game outlook model: how good were its probabilities on a past season?

Walks forward through one completed season game by game. Each game is predicted only from
results that happened before it (that season so far plus the season before, weighted like the
live model), then scored against the real outcome.

    python -m app.etl.backtest_prediction nhl
    python -m app.etl.backtest_prediction nhl --season 20252026 --tune

Read-only: it never writes to the database, and `--tune` only prints a table. Model constants
change only after a human reviews the report.
"""

from __future__ import annotations

import argparse
import itertools
from dataclasses import dataclass
from datetime import datetime

from ..core import calibration as cal
from ..core import game_model as gm
from ..core import hockey_model as hm
from ..core import prediction_service as ps
from ..core.sport_registry import get_sport
from ..db import SessionLocal
from ..models import Game

MIN_TARGET_GAMES = 50


@dataclass(frozen=True)
class FinishedGame:
    kickoff: datetime
    season: int
    result: gm.GameResult


@dataclass(frozen=True)
class BacktestReport:
    sport: str
    season: int
    games: int
    brier: float
    brier_coin_flip: float
    brier_home_rate: float
    log_loss: float
    log_loss_coin_flip: float
    total_mae: float
    total_mae_league_average: float
    over_brier: float
    bins: list[cal.CalibrationBin]


def load_finished_games(sport: str, seasons: list[int]) -> list[FinishedGame]:
    """Real finals with a kickoff time, oldest first."""
    db = SessionLocal()
    try:
        rows = (
            db.query(Game)
            .filter(
                Game.sport == sport,
                Game.status == "final",
                Game.season.in_(seasons),
                Game.home_score.isnot(None),
                Game.away_score.isnot(None),
                Game.kickoff.isnot(None),
            )
            .order_by(Game.kickoff.asc(), Game.id.asc())
            .all()
        )
        return [
            FinishedGame(
                kickoff=g.kickoff,
                season=g.season,
                result=gm.GameResult(g.home_team_id, g.away_team_id, g.home_score, g.away_score),
            )
            for g in rows
        ]
    finally:
        db.close()


def _weighted(result: gm.GameResult, weight: float) -> gm.GameResult:
    return gm.GameResult(result.home_id, result.away_id, result.home_score, result.away_score, weight)


def run_backtest(sport: str, season: int, previous_season: int, games: list[FinishedGame]) -> BacktestReport:
    prior = [_weighted(g.result, ps.PREVIOUS_SEASON_WEIGHT) for g in games if g.season == previous_season]
    target = [g for g in games if g.season == season]

    probs: list[float] = []
    outcomes: list[bool] = []
    coin_probs: list[float] = []
    home_rate_probs: list[float] = []
    predicted_totals: list[float] = []
    league_avg_totals: list[float] = []
    actual_totals: list[float] = []
    over_probs: list[float] = []
    over_outcomes: list[bool] = []

    seen: list[gm.GameResult] = []
    pending = 0
    home_wins = 0
    decided = 0
    for game in target:
        # Only results strictly before this kickoff may inform the prediction.
        while pending < len(target) and target[pending].kickoff < game.kickoff:
            seen.append(_weighted(target[pending].result, 1.0))
            pending += 1
        results = prior + seen
        projection = ps.project_game(sport, results, game.result.home_id, game.result.away_id)
        home_score, away_score = game.result.home_score, game.result.away_score

        if projection is not None:
            if home_score != away_score:
                probs.append(projection.home_win_probability)
                outcomes.append(home_score > away_score)
                coin_probs.append(0.5)
                home_rate_probs.append(home_wins / decided if decided else 0.5)

            mean_total = projection.mu_home + projection.mu_away
            predicted_totals.append(mean_total)
            league_avg_totals.append(projection.league.home_avg + projection.league.away_avg)
            actual_totals.append(float(home_score + away_score))
            line = int(mean_total) + 0.5
            over_probs.append(projection.over_probability(line))
            over_outcomes.append(home_score + away_score > line)

        if home_score != away_score:
            decided += 1
            home_wins += home_score > away_score

    if len(probs) < MIN_TARGET_GAMES:
        raise ValueError(f"only {len(probs)} predictable games in season {season}; need at least {MIN_TARGET_GAMES}")

    return BacktestReport(
        sport=sport,
        season=season,
        games=len(probs),
        brier=cal.brier_score(probs, outcomes),
        brier_coin_flip=cal.brier_score(coin_probs, outcomes),
        brier_home_rate=cal.brier_score(home_rate_probs, outcomes),
        log_loss=cal.log_loss(probs, outcomes),
        log_loss_coin_flip=cal.log_loss(coin_probs, outcomes),
        total_mae=cal.mean_absolute_error(predicted_totals, actual_totals),
        total_mae_league_average=cal.mean_absolute_error(league_avg_totals, actual_totals),
        over_brier=cal.brier_score(over_probs, over_outcomes),
        bins=cal.calibration_bins(probs, outcomes),
    )


def format_report(report: BacktestReport) -> str:
    lines = [
        f"Backtest {report.sport} season {report.season}: {report.games} games predicted from earlier results only",
        "",
        "Home win probability (lower is better)",
        f"  Brier     model {report.brier:.4f} | home-rate baseline {report.brier_home_rate:.4f} | coin flip {report.brier_coin_flip:.4f}",
        f"  Log loss  model {report.log_loss:.4f} | coin flip {report.log_loss_coin_flip:.4f}",
        "",
        "Game total",
        f"  Mean abs error  model {report.total_mae:.3f} | league average {report.total_mae_league_average:.3f}",
        f"  Over/under Brier at the half-point line nearest the projection: {report.over_brier:.4f} (coin flip 0.2500)",
        "",
        "Calibration (predicted vs observed home win rate)",
    ]
    for b in report.bins:
        lines.append(
            f"  {b.low:.1f}-{b.high:.1f}  n={b.count:4d}  predicted {b.mean_predicted:.3f}  observed {b.observed_rate:.3f}"
        )
    return "\n".join(lines)


def tune_hockey(season: int, previous_season: int, games: list[FinishedGame]) -> list[tuple[dict, BacktestReport]]:
    """Scores a small grid of hockey constants. Prints nothing and changes nothing permanently."""
    grid = {
        "PRIOR_GAMES": [15.0, 30.0, 45.0],
        "OT_STRENGTH_WEIGHT": [0.0, 0.5, 1.0],
        "PREVIOUS_SEASON_WEIGHT": [0.25, 0.5, 1.0],
    }
    original = (hm.PRIOR_GAMES, hm.OT_STRENGTH_WEIGHT, ps.PREVIOUS_SEASON_WEIGHT)
    results = []
    try:
        for prior_games, ot_weight, prev_weight in itertools.product(*grid.values()):
            hm.PRIOR_GAMES, hm.OT_STRENGTH_WEIGHT, ps.PREVIOUS_SEASON_WEIGHT = prior_games, ot_weight, prev_weight
            params = {"PRIOR_GAMES": prior_games, "OT_STRENGTH_WEIGHT": ot_weight, "PREVIOUS_SEASON_WEIGHT": prev_weight}
            results.append((params, run_backtest("nhl", season, previous_season, games)))
    finally:
        hm.PRIOR_GAMES, hm.OT_STRENGTH_WEIGHT, ps.PREVIOUS_SEASON_WEIGHT = original
    return sorted(results, key=lambda item: item[1].log_loss)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("sport", choices=["nfl", "nhl"])
    parser.add_argument("--season", type=int, help="season to backtest (default: the last completed one)")
    parser.add_argument("--tune", action="store_true", help="print a grid of hockey constants (nhl only)")
    args = parser.parse_args()

    adapter = get_sport(args.sport)
    season = args.season or adapter.previous_season(adapter.current_season())
    previous_season = adapter.previous_season(season)
    games = load_finished_games(args.sport, [previous_season, season])

    print(format_report(run_backtest(args.sport, season, previous_season, games)))

    if args.tune:
        if args.sport != "nhl":
            parser.error("--tune only supports nhl")
        print("\nGrid (sorted by log loss, best first)")
        for params, report in tune_hockey(season, previous_season, games)[:10]:
            print(f"  {params}  brier {report.brier:.4f}  log loss {report.log_loss:.4f}  total MAE {report.total_mae:.3f}")


if __name__ == "__main__":
    main()
