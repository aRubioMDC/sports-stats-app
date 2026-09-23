"""Landing-page 'board' endpoints — ValueStats-style match rows + Linemate-style widgets.

Everything here is derived from real, already-ingested data (scores, season stats,
and precomputed trend signals) — no fabricated lines or hardcoded thresholds.
"""

from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.core.deps import valid_sport
from app.core.cache import ttl_cache
from app.core.sport_registry import get_sport
from app.db import get_db
from app.etl.compute_trends import DEFAULT_THRESHOLDS, STAT_NAMES
from app.models import Game, Player, PlayerTrendSignal, PlayerWeeklyStat, Team, TeamSeasonStats
from app.schemas import BoardGameOut, CheatsheetRowOut, GameOut, ParlayOut, TeamGeneralStats, TrendGroupsOut

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
    return CheatsheetRowOut(
        player_name=signal.player.full_name,
        team=signal.player.team.abbreviation if signal.player.team else "",
        stat_name=signal.stat_name,
        threshold=signal.threshold,
        direction=signal.direction,
        hits=signal.recent_form_hits,
        games=signal.recent_form_games,
        hit_rate=round(hit_rate, 3),
    )


def _top_trends_for_teams(
    db: Session, sport: str, team_ids: set[int], limit: int, min_games: int = 3
) -> list[CheatsheetRowOut]:
    signals = (
        db.query(PlayerTrendSignal)
        .options(
            joinedload(PlayerTrendSignal.player).joinedload(Player.team),
            joinedload(PlayerTrendSignal.player).joinedload(Player.weekly_stats)
        )
        .join(Player)
        .filter(
            PlayerTrendSignal.sport == sport,
            Player.team_id.in_(team_ids),
            PlayerTrendSignal.recent_form_games >= min_games,
        )
        .order_by(PlayerTrendSignal.recent_form_hits.desc() / PlayerTrendSignal.recent_form_games)
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
    return CheatsheetRowOut(
        player_name=abbr,
        team=abbr,
        stat_name="moneyline",
        threshold=0,
        direction="win",
        hits=wins,
        games=games,
        hit_rate=round(rate, 3),
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
    return CheatsheetRowOut(
        player_name=abbr,
        team=abbr,
        stat_name="team_points",
        threshold=threshold,
        direction="over",
        hits=hits,
        games=len(scores),
        hit_rate=round(rate, 3),
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
    return CheatsheetRowOut(
        player_name=f"{game.away_team.abbreviation} @ {game.home_team.abbreviation}",
        team="",
        stat_name="game_total_points",
        threshold=threshold,
        direction="over",
        hits=hits,
        games=len(combined_scores),
        hit_rate=round(rate, 3),
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
    games = (
        db.query(Game)
        .filter(Game.sport == sport, Game.season == season, Game.week == week)
        .order_by(Game.kickoff)
        .all()
    )

    team_ids = {tid for g in games for tid in (g.home_team_id, g.away_team_id)}
    stats_by_team = {
        s.team_id: s
        for s in db.query(TeamSeasonStats).filter(
            TeamSeasonStats.sport == sport,
            TeamSeasonStats.season == season,
            TeamSeasonStats.team_id.in_(team_ids),
        )
    }

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
                home_form=_team_form(db, sport, g.home_team_id),
                away_form=_team_form(db, sport, g.away_team_id),
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


def _versus_opponent_rows(db: Session, sport: str, limit: int) -> list[CheatsheetRowOut]:
    """Hit rate for each player against this week's specific upcoming opponent."""
    adapter = get_sport(sport)
    season = adapter.current_season()
    week = adapter.current_week()

    upcoming = db.query(Game).filter(Game.sport == sport, Game.season == season, Game.week == week).all()
    opponent_by_team: dict[int, int] = {}
    for g in upcoming:
        opponent_by_team[g.home_team_id] = g.away_team_id
        opponent_by_team[g.away_team_id] = g.home_team_id
    if not opponent_by_team:
        return []

    players = (
        db.query(Player)
        .options(joinedload(Player.team))
        .filter(Player.sport == sport, Player.team_id.in_(opponent_by_team.keys()))
        .all()
    )
    player_ids = [p.id for p in players]
    logs_by_player: dict[int, list[PlayerWeeklyStat]] = defaultdict(list)
    for stat in db.query(PlayerWeeklyStat).filter(
        PlayerWeeklyStat.player_id.in_(player_ids), PlayerWeeklyStat.season.in_(_window_seasons(sport))
    ):
        logs_by_player[stat.player_id].append(stat)

    rows: list[CheatsheetRowOut] = []
    for player in players:
        opponent_id = opponent_by_team.get(player.team_id)
        logs = [g for g in logs_by_player.get(player.id, []) if g.opponent_team_id == opponent_id]
        if not logs:
            continue
        for stat_name in STAT_NAMES:
            for threshold in DEFAULT_THRESHOLDS[stat_name]:
                hits = sum(1 for g in logs if getattr(g, stat_name) > threshold)
                if hits != len(logs):
                    continue
                rows.append(
                    CheatsheetRowOut(
                        player_name=player.full_name,
                        team=player.team.abbreviation if player.team else "",
                        stat_name=stat_name,
                        threshold=threshold,
                        direction="over",
                        hits=hits,
                        games=len(logs),
                        hit_rate=1.0,
                    )
                )
    rows.sort(key=lambda r: -r.games)
    return rows[:limit]


def _home_away_split_rows(db: Session, sport: str, limit: int) -> list[CheatsheetRowOut]:
    """Hit rate for each player restricted to home games or away games, whichever
    matches their team's upcoming game this week."""
    adapter = get_sport(sport)
    season = adapter.current_season()
    week = adapter.current_week()

    upcoming = db.query(Game).filter(Game.sport == sport, Game.season == season, Game.week == week).all()
    is_home_by_team: dict[int, bool] = {}
    for g in upcoming:
        is_home_by_team[g.home_team_id] = True
        is_home_by_team[g.away_team_id] = False
    if not is_home_by_team:
        return []

    players = (
        db.query(Player)
        .options(joinedload(Player.team))
        .filter(Player.sport == sport, Player.team_id.in_(is_home_by_team.keys()))
        .all()
    )
    player_ids = [p.id for p in players]
    logs_by_player: dict[int, list[PlayerWeeklyStat]] = defaultdict(list)
    for stat in db.query(PlayerWeeklyStat).filter(
        PlayerWeeklyStat.player_id.in_(player_ids), PlayerWeeklyStat.season.in_(_window_seasons(sport))
    ):
        logs_by_player[stat.player_id].append(stat)

    rows: list[CheatsheetRowOut] = []
    for player in players:
        wants_home = is_home_by_team.get(player.team_id)
        if wants_home is None:
            continue
        logs = [g for g in logs_by_player.get(player.id, []) if g.is_home == wants_home]
        if len(logs) < 2:
            continue
        for stat_name in STAT_NAMES:
            for threshold in DEFAULT_THRESHOLDS[stat_name]:
                hits = sum(1 for g in logs if getattr(g, stat_name) > threshold)
                if hits != len(logs):
                    continue
                rows.append(
                    CheatsheetRowOut(
                        player_name=player.full_name,
                        team=player.team.abbreviation if player.team else "",
                        stat_name=stat_name,
                        threshold=threshold,
                        direction="over",
                        hits=hits,
                        games=len(logs),
                        hit_rate=1.0,
                    )
                )
    rows.sort(key=lambda r: -r.games)
    return rows[:limit]


def _unders_rows(db: Session, sport: str, limit: int) -> list[CheatsheetRowOut]:
    """Players whose last 5 games all stayed under a threshold (mirror of Recent Form)."""
    players = (
        db.query(Player).options(joinedload(Player.team)).filter(Player.sport == sport, Player.team_id.isnot(None)).all()
    )
    player_ids = [p.id for p in players]
    logs_by_player: dict[int, list[PlayerWeeklyStat]] = defaultdict(list)
    for stat in (
        db.query(PlayerWeeklyStat)
        .filter(
            PlayerWeeklyStat.player_id.in_(player_ids), PlayerWeeklyStat.season.in_(_window_seasons(sport))
        )
        .order_by(PlayerWeeklyStat.season.desc(), PlayerWeeklyStat.week.desc())
    ):
        logs_by_player[stat.player_id].append(stat)

    rows: list[CheatsheetRowOut] = []
    for player in players:
        recent = logs_by_player.get(player.id, [])[:5]
        if len(recent) < 3:
            continue
        for stat_name in STAT_NAMES:
            hit_thresholds = [
                t for t in DEFAULT_THRESHOLDS[stat_name] if sum(1 for g in recent if getattr(g, stat_name) < t) == len(recent)
            ]
            if not hit_thresholds:
                continue
            threshold = min(hit_thresholds)  # tightest under-line that still held every game
            rows.append(
                CheatsheetRowOut(
                    player_name=player.full_name,
                    team=player.team.abbreviation if player.team else "",
                    stat_name=stat_name,
                    threshold=threshold,
                    direction="under",
                    hits=len(recent),
                    games=len(recent),
                    hit_rate=1.0,
                )
            )
    rows.sort(key=lambda r: -r.games)
    return rows[:limit]


def _team_form_rows(db: Session, sport: str, limit: int) -> list[CheatsheetRowOut]:
    """Team-level scoring trend: last 5 games all above a round-number points threshold."""
    teams = db.query(Team).filter(Team.sport == sport).all()
    rows: list[CheatsheetRowOut] = []
    for team in teams:
        games = (
            db.query(Game)
            .filter(
                Game.sport == sport,
                Game.status == "final",
                (Game.home_team_id == team.id) | (Game.away_team_id == team.id),
            )
            .order_by(Game.season.desc(), Game.week.desc())
            .limit(5)
            .all()
        )
        scores = [
            (g.home_score if g.home_team_id == team.id else g.away_score) for g in games
        ]
        scores = [s for s in scores if s is not None]
        if len(scores) < 3:
            continue
        for threshold in TEAM_POINT_THRESHOLDS:
            hits = sum(1 for s in scores if s > threshold)
            if hits != len(scores):
                continue
            rows.append(
                CheatsheetRowOut(
                    player_name=team.name,
                    team=team.abbreviation,
                    stat_name="team_points",
                    threshold=threshold,
                    direction="over",
                    hits=hits,
                    games=len(scores),
                    hit_rate=1.0,
                )
            )
            break  # take the single most impressive (highest) threshold per team
    rows.sort(key=lambda r: -r.games)
    return rows[:limit]


def _injury_impact_rows(db: Session, sport: str, limit: int) -> list[CheatsheetRowOut]:
    """Teammate hit rate in games a notable player missed \u2014 derived purely from the
    absence of that player's own weekly stat row, no external injury feed needed."""
    players = (
        db.query(Player).options(joinedload(Player.team)).filter(Player.sport == sport, Player.team_id.isnot(None)).all()
    )
    players_by_team: dict[int, list[Player]] = defaultdict(list)
    for p in players:
        players_by_team[p.team_id].append(p)

    logs_by_player_week: dict[int, dict[tuple[int, int], PlayerWeeklyStat]] = defaultdict(dict)
    weeks_by_player: dict[int, set[tuple[int, int]]] = defaultdict(set)
    for stat in db.query(PlayerWeeklyStat).filter(
        PlayerWeeklyStat.player_id.in_([p.id for p in players]), PlayerWeeklyStat.season.in_(_window_seasons(sport))
    ):
        key = (stat.season, stat.week)
        logs_by_player_week[stat.player_id][key] = stat
        weeks_by_player[stat.player_id].add(key)

    rows: list[CheatsheetRowOut] = []
    for team_id, roster in players_by_team.items():
        team_weeks: set[tuple[int, int]] = set()
        for p in roster:
            team_weeks |= weeks_by_player.get(p.id, set())
        if not team_weeks:
            continue

        for impact_player in roster:
            impact_weeks = weeks_by_player.get(impact_player.id, set())
            # Only a real, established starter counts as a notable absence — otherwise
            # "games without a 5th-string player" is just "most games", not a signal.
            if len(impact_weeks) < 8:
                continue
            missed_weeks = team_weeks - impact_weeks
            if not (2 <= len(missed_weeks) <= 6):
                continue

            for other in roster:
                if other.id == impact_player.id:
                    continue
                other_logs = [
                    logs_by_player_week[other.id][w] for w in missed_weeks if w in logs_by_player_week.get(other.id, {})
                ]
                if len(other_logs) < 2:
                    continue
                for stat_name in STAT_NAMES:
                    for threshold in DEFAULT_THRESHOLDS[stat_name]:
                        hits = sum(1 for g in other_logs if getattr(g, stat_name) > threshold)
                        if hits != len(other_logs):
                            continue
                        rows.append(
                            CheatsheetRowOut(
                                player_name=other.full_name,
                                team=other.team.abbreviation if other.team else "",
                                stat_name=stat_name,
                                threshold=threshold,
                                direction="over",
                                hits=hits,
                                games=len(other_logs),
                                hit_rate=1.0,
                                without_player=impact_player.full_name,
                            )
                        )
    rows.sort(key=lambda r: -r.games)
    return rows[:limit]


def _stat_allowed_ranks(db: Session, sport: str) -> dict[str, dict[int, int]]:
    """Rank every team's defense per stat — 1 = allows the least (best defense),
    N = allows the most (worst defense, i.e. the best matchup for an opposing player).
    Computed by summing what opposing players actually produced against each team.
    """
    team_ids = _active_team_ids(db, sport)
    logs = (
        db.query(PlayerWeeklyStat)
        .join(Player)
        .filter(Player.sport == sport, PlayerWeeklyStat.season.in_(_window_seasons(sport)))
        .all()
    )

    ranks: dict[str, dict[int, int]] = {}
    for stat_name in STAT_NAMES:
        allowed: dict[int, float] = {team_id: 0.0 for team_id in team_ids}
        for log in logs:
            if log.opponent_team_id in allowed:
                allowed[log.opponent_team_id] += getattr(log, stat_name)
        ordered = sorted(allowed.items(), key=lambda item: item[1])  # fewest allowed first
        ranks[stat_name] = {team_id: i + 1 for i, (team_id, _) in enumerate(ordered)}
    return ranks


def _opponent_rank_rows(db: Session, sport: str, limit: int) -> list[CheatsheetRowOut]:
    """Recent-form signals where this week's upcoming opponent has one of the worst
    defenses against that exact stat — a good matchup, not just a hot streak."""
    adapter = get_sport(sport)
    season = adapter.current_season()
    week = adapter.current_week()
    team_count = len(_active_team_ids(db, sport))
    if team_count == 0:
        return []

    upcoming = db.query(Game).filter(Game.sport == sport, Game.season == season, Game.week == week).all()
    opponent_by_team: dict[int, int] = {}
    for g in upcoming:
        opponent_by_team[g.home_team_id] = g.away_team_id
        opponent_by_team[g.away_team_id] = g.home_team_id
    if not opponent_by_team:
        return []

    ranks = _stat_allowed_ranks(db, sport)
    # "Good matchup" = opponent sits in the bottom third of defenses for that stat.
    bad_defense_floor = max(1, round(team_count * 2 / 3))

    signals = (
        db.query(PlayerTrendSignal)
        .options(joinedload(PlayerTrendSignal.player).joinedload(Player.team))
        .filter(
            PlayerTrendSignal.sport == sport,
            PlayerTrendSignal.recent_form_games >= 3,
            PlayerTrendSignal.recent_form_hits == PlayerTrendSignal.recent_form_games,
        )
        .all()
    )

    rows: list[CheatsheetRowOut] = []
    for signal in signals:
        player = signal.player
        if player.team_id is None:
            continue
        opponent_id = opponent_by_team.get(player.team_id)
        if opponent_id is None:
            continue
        rank = ranks.get(signal.stat_name, {}).get(opponent_id)
        if rank is None or rank < bad_defense_floor:
            continue
        row = _to_row(signal)
        row.opponent_rank = rank
        row.opponent_team_count = team_count
        rows.append(row)

    rows.sort(key=lambda r: (-(r.opponent_rank or 0), -r.games))
    return rows[:limit]


@router.get("/trends/groups", response_model=TrendGroupsOut)
@ttl_cache(seconds=300)
def get_trend_groups(sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    signals = (
        db.query(PlayerTrendSignal)
        .options(joinedload(PlayerTrendSignal.player).joinedload(Player.team))
        .filter(PlayerTrendSignal.sport == sport, PlayerTrendSignal.recent_form_games >= 3)
        .all()
    )

    by_player_stat: dict[tuple[int, str], list[PlayerTrendSignal]] = defaultdict(list)
    for s in signals:
        by_player_stat[(s.player_id, s.stat_name)].append(s)

    # Recent Form = the lowest 100%-hit threshold per player+stat (the "main" line).
    # Alternate Lines = the highest 100%-hit threshold for that same player+stat (the "alt" line).
    recent_form_rows: list[CheatsheetRowOut] = []
    alt_line_rows: list[CheatsheetRowOut] = []
    for sigs in by_player_stat.values():
        hundred = sorted(
            (s for s in sigs if s.recent_form_games and s.recent_form_hits == s.recent_form_games),
            key=lambda s: s.threshold,
        )
        if not hundred:
            continue
        recent_form_rows.append(_to_row(hundred[0]))
        if hundred[-1].threshold != hundred[0].threshold:
            alt_line_rows.append(_to_row(hundred[-1]))

    recent_form_rows.sort(key=lambda r: -r.games)
    alt_line_rows.sort(key=lambda r: -r.games)

    return TrendGroupsOut(
        recent_form=recent_form_rows[:5],
        versus_opponent=_versus_opponent_rows(db, sport, limit=5),
        alternate_lines=alt_line_rows[:5],
        home_away_splits=_home_away_split_rows(db, sport, limit=5),
        unders_only=_unders_rows(db, sport, limit=5),
        team_form=_team_form_rows(db, sport, limit=5),
        injury_impact=_injury_impact_rows(db, sport, limit=6),
        opponent_rank=_opponent_rank_rows(db, sport, limit=6),
    )
