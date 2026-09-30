"""Landing-page 'board' endpoints — ValueStats-style match rows + Linemate-style widgets.

Everything here is derived from real, already-ingested data (scores, season stats,
and precomputed trend signals) — no fabricated lines or hardcoded thresholds.
"""

from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..core.deps import valid_sport
from ..core.cache import ttl_cache
from ..core.sport_registry import get_sport
from ..core.stats_math import wilson_interval
from ..db import get_db
from ..models import Game, Player, PlayerTrendSignal, PlayerWeeklyStat, Team, TeamSeasonStats
from ..schemas import BoardGameOut, CheatsheetRowOut, GameOut, ParlayOut, TeamGeneralStats

router = APIRouter(prefix="/{sport}", tags=["board"])

# Self-chosen round-number thresholds for team scoring trends, same convention as
# DEFAULT_THRESHOLDS for player props — not tied to any real sportsbook line.
TEAM_POINT_THRESHOLDS = [27.5, 23.5, 20.5, 17.5]
GAME_TOTAL_THRESHOLDS = [50.5, 44.5, 40.5, 36.5]


def _window_seasons(sport: str) -> list[int]:
    """The only seasons that should ever feed live trend queries — guards against
    orphaned/stale PlayerWeeklyStat rows from past seasons silently inflating counts."""
    season = get_sport(sport).current_season()
    return [season - 1, season]


def _active_team_ids(db: Session, sport: str) -> set[int]:
    """Teams that actually appear in the current season's schedule — the Team table can
    carry stale relocated-franchise rows (e.g. old LAR/OAK/SD/STL aliases) that would
    otherwise inflate "how many teams" denominators used for ranks."""
    season = get_sport(sport).current_season()
    team_ids: set[int] = set()
    for g in db.query(Game).filter(Game.sport == sport, Game.season == season):
        team_ids.add(g.home_team_id)
        team_ids.add(g.away_team_id)
    return team_ids


def _team_form(db: Session, sport: str, team_id: int, limit: int = 5) -> list[str]:
    games = (
        db.query(Game)
        .filter(
            Game.sport == sport,
            Game.status == "final",
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
        )
        .order_by(Game.season.desc(), Game.week.desc())
        .limit(limit)
        .all()
    )
    form: list[str] = []
    for g in games:
        if g.home_team_id == team_id:
            team_score, opp_score = g.home_score or 0, g.away_score or 0
        else:
            team_score, opp_score = g.away_score or 0, g.home_score or 0
        form.append("W" if team_score > opp_score else "L" if team_score < opp_score else "T")
    return form


def _to_row(signal: PlayerTrendSignal) -> CheatsheetRowOut:
    hit_rate = signal.recent_form_hits / signal.recent_form_games if signal.recent_form_games else 0.0
    ci_low, ci_high = wilson_interval(signal.recent_form_hits, signal.recent_form_games)
    return CheatsheetRowOut(
        player_id=signal.player_id,
        player_name=signal.player.full_name,
        team=signal.player.team.abbreviation if signal.player.team else "",
        stat_name=signal.stat_name,
        threshold=signal.threshold,
        direction=signal.direction,
        hits=signal.recent_form_hits,
        games=signal.recent_form_games,
        hit_rate=round(hit_rate, 3),
        hit_rate_ci_low=round(ci_low, 3),
        hit_rate_ci_high=round(ci_high, 3),
    )


def _top_trends_for_teams(
    db: Session, sport: str, team_ids: set[int], limit: int, min_games: int = 3
) -> list[CheatsheetRowOut]:
    signals = (
        db.query(PlayerTrendSignal)
        .options(
            joinedload(PlayerTrendSignal.player).joinedload(Player.team)
        )
        .join(Player)
        .filter(
            PlayerTrendSignal.sport == sport,
            Player.team_id.in_(team_ids),
            PlayerTrendSignal.recent_form_games >= min_games,
        )
        .order_by((PlayerTrendSignal.recent_form_hits / PlayerTrendSignal.recent_form_games).desc())
        .limit(limit)
        .all()
    )
    rows = [_to_row(s) for s in signals]
    rows.sort(key=lambda r: (-r.hit_rate, -r.games))
    return rows[:limit]


def _moneyline_trend(db: Session, sport: str, game: Game) -> CheatsheetRowOut | None:
    """Which of the two teams has the stronger recent win rate — the first thing a
    bettor checks (who wins), before any prop or total."""
    candidates = []
    for team_id, abbr in (
        (game.home_team_id, game.home_team.abbreviation),
        (game.away_team_id, game.away_team.abbreviation),
    ):
        form = _team_form(db, sport, team_id, limit=5)
        if len(form) < 3:
            continue
        wins = form.count("W")
        candidates.append((wins / len(form), wins, len(form), abbr))
    if not candidates:
        return None
    rate, wins, games, abbr = max(candidates, key=lambda c: c[0])
    ci_low, ci_high = wilson_interval(wins, games)
    return CheatsheetRowOut(
        player_name=abbr,
        team=abbr,
        stat_name="moneyline",
        threshold=0,
        direction="win",
        hits=wins,
        games=games,
        hit_rate=round(rate, 3),
        hit_rate_ci_low=round(ci_low, 3),
        hit_rate_ci_high=round(ci_high, 3),
    )


def _team_points_trend(db: Session, sport: str, team_id: int, abbr: str) -> CheatsheetRowOut | None:
    """Best-fitting team-total-points threshold over that team's last 5 games."""
    games = (
        db.query(Game)
        .filter(
            Game.sport == sport,
            Game.status == "final",
            (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
        )
        .order_by(Game.season.desc(), Game.week.desc())
        .limit(5)
        .all()
    )
    scores = [(g.home_score if g.home_team_id == team_id else g.away_score) for g in games]
    scores = [s for s in scores if s is not None]
    if len(scores) < 3:
        return None
    best: tuple[float, int, float] | None = None
    for threshold in TEAM_POINT_THRESHOLDS:
        hits = sum(1 for s in scores if s > threshold)
        rate = hits / len(scores)
        if best is None or rate > best[0]:
            best = (rate, hits, threshold)
    rate, hits, threshold = best
    ci_low, ci_high = wilson_interval(hits, len(scores))
    return CheatsheetRowOut(
        player_name=abbr,
        team=abbr,
        stat_name="team_points",
        threshold=threshold,
        direction="over",
        hits=hits,
        games=len(scores),
        hit_rate=round(rate, 3),
        hit_rate_ci_low=round(ci_low, 3),
        hit_rate_ci_high=round(ci_high, 3),
    )


def _game_total_trend(db: Session, sport: str, game: Game) -> CheatsheetRowOut | None:
    """Combined-score (both teams) over/under trend, pooling each team's last 5 games."""
    combined_scores: list[int] = []
    for team_id in (game.home_team_id, game.away_team_id):
        recent = (
            db.query(Game)
            .filter(
                Game.sport == sport,
                Game.status == "final",
                (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
            )
            .order_by(Game.season.desc(), Game.week.desc())
            .limit(5)
            .all()
        )
        for g in recent:
            if g.home_score is not None and g.away_score is not None:
                combined_scores.append(g.home_score + g.away_score)
    if len(combined_scores) < 3:
        return None
    best: tuple[float, int, float] | None = None
    for threshold in GAME_TOTAL_THRESHOLDS:
        hits = sum(1 for s in combined_scores if s > threshold)
        rate = hits / len(combined_scores)
        if best is None or rate > best[0]:
            best = (rate, hits, threshold)
    rate, hits, threshold = best
    ci_low, ci_high = wilson_interval(hits, len(combined_scores))
    return CheatsheetRowOut(
        player_name=f"{game.away_team.abbreviation} @ {game.home_team.abbreviation}",
        team="",
        stat_name="game_total_points",
        threshold=threshold,
        direction="over",
        hits=hits,
        games=len(combined_scores),
        hit_rate=round(rate, 3),
        hit_rate_ci_low=round(ci_low, 3),
        hit_rate_ci_high=round(ci_high, 3),
    )


def _game_market_trends(db: Session, sport: str, game: Game) -> list[CheatsheetRowOut]:
    """ValueStats-style match-row trends: Moneyline first, then team total, then game total —
    team-level markets, not player props (those are already covered in Cheatsheets below)."""
    rows: list[CheatsheetRowOut] = []
    ml = _moneyline_trend(db, sport, game)
    if ml:
        rows.append(ml)
    team_totals = [
        r
        for r in (
            _team_points_trend(db, sport, game.home_team_id, game.home_team.abbreviation),
            _team_points_trend(db, sport, game.away_team_id, game.away_team.abbreviation),
        )
        if r
    ]
    if team_totals:
        rows.append(max(team_totals, key=lambda r: r.hit_rate))
    game_total = _game_total_trend(db, sport, game)
    if game_total:
        rows.append(game_total)
    return rows[:3]


@router.get("/board", response_model=list[BoardGameOut])
@ttl_cache(seconds=60)
def get_board(season: int, week: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    # Batch query all games with season/week
    games = (
        db.query(Game)
        .filter(Game.sport == sport, Game.season == season, Game.week == week)
        .order_by(Game.kickoff)
        .all()
    )

    team_ids = {tid for g in games for tid in (g.home_team_id, g.away_team_id)}
    
    # Batch 1: Team stats for all teams
    stats_by_team = {
        s.team_id: s
        for s in db.query(TeamSeasonStats).filter(
            TeamSeasonStats.sport == sport,
            TeamSeasonStats.season == season,
            TeamSeasonStats.team_id.in_(team_ids),
        )
    }
    
    # Batch 2: All final games for team form calculation (pre-cache forms)
    all_final_games = (
        db.query(Game)
        .filter(
            Game.sport == sport,
            Game.status == "final",
            (Game.home_team_id.in_(team_ids)) | (Game.away_team_id.in_(team_ids))
        )
        .order_by(Game.season.desc(), Game.week.desc())
        .all()
    )
    
    # Cache team form in memory to avoid repeated queries
    form_cache: dict[int, list[str]] = {}
    for team_id in team_ids:
        relevant_games = [g for g in all_final_games if g.home_team_id == team_id or g.away_team_id == team_id][:5]
        form: list[str] = []
        for g in relevant_games:
            if g.home_team_id == team_id:
                team_score, opp_score = g.home_score or 0, g.away_score or 0
            else:
                team_score, opp_score = g.away_score or 0, g.home_score or 0
            form.append("W" if team_score > opp_score else "L" if team_score < opp_score else "T")
        form_cache[team_id] = form

    def _stats_out(team_id: int) -> TeamGeneralStats | None:
        s = stats_by_team.get(team_id)
        if s is None:
            return None
        return TeamGeneralStats(
            points_per_game=round(s.points_per_game, 1),
            points_per_game_rank=s.points_per_game_rank,
            yards_per_game=round(s.yards_per_game, 1),
            yards_per_game_rank=s.yards_per_game_rank,
        )

    rows: list[BoardGameOut] = []
    for g in games:
        # Use cached form instead of querying
        home_form = form_cache.get(g.home_team_id, [])
        away_form = form_cache.get(g.away_team_id, [])
        rows.append(
            BoardGameOut(
                game=GameOut(
                    id=g.id,
                    season=g.season,
                    week=g.week,
                    kickoff=g.kickoff.isoformat() if g.kickoff else None,
                    home_team=g.home_team,
                    away_team=g.away_team,
                    home_score=g.home_score,
                    away_score=g.away_score,
                    status=g.status,
                ),
                home_form=home_form,
                away_form=away_form,
                home_stats=_stats_out(g.home_team_id),
                away_stats=_stats_out(g.away_team_id),
                top_trends=_game_market_trends(db, sport, g),
            )
        )
    return rows


@router.get("/games/{game_id}/parlays", response_model=list[ParlayOut])
@ttl_cache(seconds=60)
def get_parlays(game_id: int, sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    """Several 2-3 leg parlay slates for this game, like Linemate's "Parlays for X @ Y"
    carousel — each slate is a distinct group of the game's best hit-rate legs."""
    game = db.query(Game).filter(Game.id == game_id, Game.sport == sport).one_or_none()
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    candidates = _top_trends_for_teams(db, sport, {game.home_team_id, game.away_team_id}, limit=12)

    parlays: list[ParlayOut] = []
    for i in range(0, len(candidates), 3):
        group = candidates[i : i + 3]
        if len(group) < 2:
            break  # a lone leftover leg isn't a parlay
        parlays.append(
            ParlayOut(
                legs=group,
                summary_hits=min(leg.hits for leg in group),
                summary_games=min(leg.games for leg in group),
            )
        )
    return parlays









