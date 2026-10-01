"""Cheatsheet/trends business logic — extracted from routers/trends.py (SOLID
audit: that file mixed route handlers, batch queries, and this logic in one
~830-line module). Route handlers in trends.py should stay thin wrappers
around these functions; batch-fetch helpers live in trends_queries.py.
"""

from datetime import datetime, timedelta

from sqlalchemy.orm import Session, joinedload

from ..core.betting_math import american_to_implied_prob, devig_two_way, kelly_fraction
from ..core.constants import CHEATSHEET_BATCH_FETCH_LIMIT, CHEATSHEET_MAX_ROWS, MIN_GAMES_FOR_TREND
from ..core.stats_math import wilson_interval
from ..etl.ingest_odds import STAT_TO_PLAYER_MARKET
from ..models import Game, Player, PlayerPropOdds, PlayerTrendSignal, PlayerWeeklyStat
from ..schemas import CheatsheetRowOut, TrendGroupsOut
from .trends_queries import (
    batch_calculate_opponent_ranks,
    batch_compute_injury_impacts,
    batch_fetch_player_logs,
    batch_fetch_player_prop_odds,
    batch_fetch_team_abbreviations,
    head_to_head_rate,
    home_away_split_rate,
    injury_impact_rate,
)


def _match_market_edge(
    odds_rows: list[PlayerPropOdds],
    player_logs: list[PlayerWeeklyStat],
    stat_name: str,
    direction: str,
    min_season: int,
) -> tuple[float, float, float, int, int, float, float, float] | None:
    """
    Finds a real market line for this player/stat and recomputes OUR hit rate
    directly against THAT real line (not our own independently-chosen
    threshold) — comparing hit rate for a threshold of 20.5 against a market
    priced at 41.5 would be an apples-to-oranges "edge" even though both are
    real numbers. Requires >=3 games in the window to avoid a fabricated edge
    off a tiny recomputed sample. Returns
    (line, price, implied_prob, hits, games, edge, opening_line, kelly) or
    None if we have no real matching odds or too few games to grade them
    against.
    """
    market_key = STAT_TO_PLAYER_MARKET.get(stat_name)
    if market_key is None:
        return None
    matching = [r for r in odds_rows if r.market == market_key]
    if not matching:
        return None
    # The most recent snapshot is the current price. Its opening line is
    # tracked from the SAME bookmaker's earliest snapshot only — comparing
    # across different bookmakers would confuse book-to-book price
    # differences with genuine movement over time.
    line_row = max(matching, key=lambda r: r.fetched_at)
    same_book = [r for r in matching if r.bookmaker == line_row.bookmaker]
    opening_line = min(same_book, key=lambda r: r.fetched_at).line
    price = line_row.over_price if direction == "over" else line_row.under_price
    if price is None:
        return None

    relevant_logs = [g for g in player_logs if g.season >= min_season]
    if direction == "over":
        hits = sum(1 for g in relevant_logs if getattr(g, stat_name, 0) > line_row.line)
    else:
        hits = sum(1 for g in relevant_logs if getattr(g, stat_name, 0) < line_row.line)
    games = len(relevant_logs)
    if games < MIN_GAMES_FOR_TREND:
        return None

    if line_row.over_price is not None and line_row.under_price is not None:
        over_prob, under_prob = devig_two_way(line_row.over_price, line_row.under_price)
        implied_prob = over_prob if direction == "over" else under_prob
    else:
        implied_prob = american_to_implied_prob(price)

    edge = hits / games - implied_prob
    # Kelly sizing uses the conservative Wilson lower bound, not the raw point
    # estimate — a 5/5 sample shouldn't be treated as a "certain" 100% probability.
    ci_low, _ = wilson_interval(hits, games)
    kelly = kelly_fraction(ci_low, price)
    return (
        line_row.line,
        price,
        round(implied_prob, 3),
        hits,
        games,
        round(edge, 3),
        opening_line,
        round(kelly, 4),
    )


def _get_cheatsheet_internal(
    sport: str,
    season: int | None,
    week: int | None,
    days_back: int | None,
    min_hit_rate: float,
    min_games: int,
    db: Session,
) -> list[CheatsheetRowOut]:
    """
    Internal helper to get cheatsheet rows (reusable for /groups endpoint).

    Query parameters:
    - season, week: Filter to players playing that week (historical)
    - days_back: Filter to games in last N days (0=today, 1=last 24h, etc) for "Trending Today"
    - min_hit_rate: Minimum hit rate (0.0 to 1.0)
    - min_games: Minimum number of games to qualify
    """
    # Query with limit to avoid loading too much data
    # Order by recent_form_hits DESC to prioritize high hit-rate signals
    query = (
        db.query(PlayerTrendSignal)
        .options(joinedload(PlayerTrendSignal.player).joinedload(Player.team))
        .filter(
            PlayerTrendSignal.sport == sport,
            PlayerTrendSignal.recent_form_games >= min_games
        )
    )
    # When not recomputing from daily stats, the precomputed hits/games ratio
    # already tells us the hit rate — push the min_hit_rate filter down into
    # SQL so we don't pull thousands of rows over the wire just to drop them.
    if days_back is None and min_hit_rate > 0:
        query = query.filter(
            PlayerTrendSignal.recent_form_hits >= min_hit_rate * PlayerTrendSignal.recent_form_games
        )
    signals = (
        query
        .order_by(PlayerTrendSignal.recent_form_hits.desc())  # Prioritize high hit rates
        .limit(CHEATSHEET_BATCH_FETCH_LIMIT)
        .all()
    )

    # If filtering by week, get team IDs playing that week
    playing_team_ids = None
    if season is not None and week is not None:
        games = db.query(Game).filter(
            Game.sport == sport,
            Game.season == season,
            Game.week == week
        ).all()
        playing_team_ids = set()
        for game in games:
            playing_team_ids.add(game.home_team_id)
            playing_team_ids.add(game.away_team_id)

    # Pre-fetch all games in date range if days_back is set
    games_in_range = None
    stats_by_player_in_range: dict[int, list[PlayerWeeklyStat]] = {}
    if days_back is not None:
        cutoff_date = datetime.utcnow() - timedelta(days=days_back)
        games_in_range = db.query(Game.id).filter(
            Game.sport == sport,
            Game.kickoff >= cutoff_date
        ).all()
        games_in_range = {g[0] for g in games_in_range}
        if games_in_range:
            # Batch-fetch stats for every signal's player up front instead of
            # one query per signal inside the loop below.
            player_ids_in_signals = {s.player_id for s in signals}
            stats_in_range = db.query(PlayerWeeklyStat).filter(
                PlayerWeeklyStat.player_id.in_(player_ids_in_signals),
                PlayerWeeklyStat.game_id.in_(games_in_range),
            ).all()
            for stat in stats_in_range:
                stats_by_player_in_range.setdefault(stat.player_id, []).append(stat)

    # Pre-calculate next game for each team to avoid N queries
    next_game_by_team: dict[int, Game | None] = {}
    all_team_ids = set()
    for signal in signals:
        if signal.player.team_id:
            all_team_ids.add(signal.player.team_id)

    if all_team_ids:
        next_games = (
            db.query(Game)
            .filter(
                Game.sport == sport,
                Game.status.in_(["scheduled", "in_progress"]),
                (Game.home_team_id.in_(all_team_ids)) | (Game.away_team_id.in_(all_team_ids))
            )
            .order_by(Game.kickoff.asc())
            .all()
        )
        # Build mapping of team_id -> next game
        for game in next_games:
            if game.home_team_id in all_team_ids and game.home_team_id not in next_game_by_team:
                next_game_by_team[game.home_team_id] = game
            if game.away_team_id in all_team_ids and game.away_team_id not in next_game_by_team:
                next_game_by_team[game.away_team_id] = game

    # Get current season for opponent rank calculations (single query instead of two)
    if season:
        current_season = season
    else:
        latest_game = db.query(Game).filter(Game.sport == sport).order_by(Game.season.desc()).first()
        current_season = latest_game.season if latest_game else 2026

    # First pass: compute hits/games/hit_rate and apply filters, but skip the
    # expensive per-row injury/opponent-rank lookups until we know which rows
    # actually make the final top-100 cut.
    candidates: list[tuple[PlayerTrendSignal, int, int, float]] = []
    for signal in signals:
        # Skip if player's team is not playing this week
        if playing_team_ids is not None and signal.player.team_id not in playing_team_ids:
            continue

        # Use daily hit-rate if days_back specified, otherwise use precomputed signal
        if games_in_range is not None:  # days_back was set
            stats = stats_by_player_in_range.get(signal.player_id, [])

            hits = sum(1 for s in stats if getattr(s, signal.stat_name, 0) > signal.threshold)
            games = len(stats)
            if games < min_games:
                continue
            hit_rate = hits / games if games > 0 else 0
        else:
            if signal.recent_form_games < min_games:
                continue
            hits = signal.recent_form_hits
            games = signal.recent_form_games
            hit_rate = hits / games

        if hit_rate < min_hit_rate:
            continue

        candidates.append((signal, hits, games, hit_rate))

    candidates.sort(key=lambda c: (-c[3], -c[2]))
    candidates = candidates[:CHEATSHEET_MAX_ROWS]

    # Batch-fetch injury and opponent-rank data for only the rows that survived
    # the cut above (was previously one query per row for every candidate).
    opponent_lookups: set[tuple[int, int]] = set()
    opponent_ids: set[int] = set()
    for signal, _, _, _ in candidates:
        next_game = next_game_by_team.get(signal.player.team_id) if signal.player.team_id else None
        if next_game:
            opponent_id = (
                next_game.away_team_id
                if next_game.home_team_id == signal.player.team_id
                else next_game.home_team_id
            )
            if opponent_id:
                opponent_lookups.add((opponent_id, current_season))
                opponent_ids.add(opponent_id)
    opponent_ranks = batch_calculate_opponent_ranks(db, opponent_lookups)
    opponent_abbrs = batch_fetch_team_abbreviations(db, opponent_ids)
    stats_by_player = batch_fetch_player_logs(db, {signal.player_id for signal, _, _, _ in candidates})
    injury_impacts = batch_compute_injury_impacts(
        db, {signal.player.team_id for signal, _, _, _ in candidates if signal.player.team_id}, current_season - 1
    )
    market_odds_by_player = batch_fetch_player_prop_odds(db, {signal.player_id for signal, _, _, _ in candidates})
    # Same 2-season span as the small-sample blending rule, so split/h2h reflect
    # "recent" history rather than a player's entire career.
    min_season = current_season - 1

    rows: list[CheatsheetRowOut] = []
    for signal, hits, games, hit_rate in candidates:
        # Use pre-calculated next game from cache instead of querying
        game_id = None
        game_kickoff = None
        is_home = None
        opponent_rank = None
        opponent_team_count = None
        opponent_id = None
        opponent_abbr = None

        if signal.player.team_id and signal.player.team_id in next_game_by_team:
            next_game = next_game_by_team[signal.player.team_id]
            if next_game:
                game_id = next_game.id
                game_kickoff = next_game.kickoff.isoformat() if next_game.kickoff else None
                is_home = next_game.home_team_id == signal.player.team_id

                # Look up pre-calculated opponent defensive rank
                opponent_id = next_game.away_team_id if is_home else next_game.home_team_id
                opp_rank = opponent_ranks.get((opponent_id, current_season)) if opponent_id else None
                opponent_rank = opp_rank
                opponent_team_count = 32 if opp_rank else None
                opponent_abbr = opponent_abbrs.get(opponent_id) if opponent_id else None

        player_logs = stats_by_player.get(signal.player_id, [])
        split_hits, split_games = home_away_split_rate(
            player_logs, signal.stat_name, signal.threshold, is_home, min_season
        )
        h2h_hits, h2h_games = head_to_head_rate(
            player_logs, signal.stat_name, signal.threshold, opponent_id, min_season
        )

        without_player = None
        without_player_hits = None
        without_player_games = None
        team_absence = injury_impacts.get(signal.player.team_id) if signal.player.team_id else None
        if team_absence:
            teammate_name, missed_weeks = team_absence
            if teammate_name != signal.player.full_name:
                imp_hits, imp_games = injury_impact_rate(
                    player_logs, signal.stat_name, signal.threshold, missed_weeks
                )
                if imp_games >= 2:
                    without_player = teammate_name
                    without_player_hits = imp_hits
                    without_player_games = imp_games

        ci_low, ci_high = wilson_interval(hits, games)

        market_line = None
        market_opening_line = None
        market_price = None
        market_implied_prob = None
        market_hits = None
        market_games = None
        edge = None
        kelly = None
        market_match = _match_market_edge(
            market_odds_by_player.get(signal.player_id, []), player_logs, signal.stat_name, signal.direction, min_season
        )
        if market_match:
            (
                market_line,
                market_price,
                market_implied_prob,
                market_hits,
                market_games,
                edge,
                market_opening_line,
                kelly,
            ) = market_match

        rows.append(
            CheatsheetRowOut(
                player_id=signal.player_id,
                player_name=signal.player.full_name,
                team=signal.player.team.abbreviation if signal.player.team else "",
                stat_name=signal.stat_name,
                threshold=signal.threshold,
                direction=signal.direction,
                hits=hits,
                games=games,
                hit_rate=round(hit_rate, 3),
                hit_rate_ci_low=round(ci_low, 3),
                hit_rate_ci_high=round(ci_high, 3),
                market_line=market_line,
                market_opening_line=market_opening_line,
                market_price=market_price,
                market_implied_prob=market_implied_prob,
                market_hits=market_hits,
                market_games=market_games,
                edge=edge,
                kelly_fraction=kelly,
                # Derived from actual roster participation (a missing weekly-stat
                # row for an established player = didn't play that week), not
                # fabricated — see batch_compute_injury_impacts.
                without_player=without_player,
                without_player_hits=without_player_hits,
                without_player_games=without_player_games,
                opponent_rank=opponent_rank,
                opponent_team_count=opponent_team_count,
                opponent_team=opponent_abbr,
                # Contextual signal data for Linemate-style badges, computed live
                # against the specific upcoming opponent/venue (not precomputed).
                split_hits=split_hits if split_games > 0 else None,
                split_games=split_games if split_games > 0 else None,
                h2h_hits=h2h_hits if h2h_games > 0 else None,
                h2h_games=h2h_games if h2h_games > 0 else None,
                # Game information for sorting by upcoming games
                game_id=game_id,
                game_kickoff=game_kickoff,
                is_home=is_home,
            )
        )
    rows.sort(key=lambda r: (-r.hit_rate, -r.games))
    return rows[:CHEATSHEET_MAX_ROWS]  # Return max rows after ranking


def get_player_signal_rows(sport: str, player_id: int, db: Session) -> list[CheatsheetRowOut]:
    """
    Every real signal computed for one player — no top-100 cross-player cut and
    no min_hit_rate/min_games floor, since a dedicated player page should show
    the full real picture (including weaker/unfavorable signals), not just the
    subset that made the site-wide cheatsheet.
    """
    signals = (
        db.query(PlayerTrendSignal)
        .options(joinedload(PlayerTrendSignal.player).joinedload(Player.team))
        .filter(PlayerTrendSignal.sport == sport, PlayerTrendSignal.player_id == player_id)
        .all()
    )
    if not signals:
        return []

    player = signals[0].player
    next_game_by_team: dict[int, Game | None] = {}
    if player.team_id:
        next_game = (
            db.query(Game)
            .filter(
                Game.sport == sport,
                Game.status.in_(["scheduled", "in_progress"]),
                (Game.home_team_id == player.team_id) | (Game.away_team_id == player.team_id),
            )
            .order_by(Game.kickoff.asc())
            .first()
        )
        next_game_by_team[player.team_id] = next_game

    latest_game = db.query(Game).filter(Game.sport == sport).order_by(Game.season.desc()).first()
    current_season = latest_game.season if latest_game else 2026
    min_season = current_season - 1

    opponent_lookups: set[tuple[int, int]] = set()
    opponent_ids: set[int] = set()
    next_game = next_game_by_team.get(player.team_id) if player.team_id else None
    if next_game:
        opponent_id = next_game.away_team_id if next_game.home_team_id == player.team_id else next_game.home_team_id
        if opponent_id:
            opponent_lookups.add((opponent_id, current_season))
            opponent_ids.add(opponent_id)
    opponent_ranks = batch_calculate_opponent_ranks(db, opponent_lookups)
    opponent_abbrs = batch_fetch_team_abbreviations(db, opponent_ids)
    stats_by_player = batch_fetch_player_logs(db, {player_id})
    injury_impacts = batch_compute_injury_impacts(db, {player.team_id} if player.team_id else set(), min_season)
    market_odds_by_player = batch_fetch_player_prop_odds(db, {player_id})

    rows: list[CheatsheetRowOut] = []
    for signal in signals:
        if not signal.recent_form_games:
            continue
        hits, games = signal.recent_form_hits, signal.recent_form_games
        hit_rate = hits / games

        game_id = None
        game_kickoff = None
        is_home = None
        opponent_rank = None
        opponent_team_count = None
        opponent_id = None
        opponent_abbr = None
        if next_game:
            game_id = next_game.id
            game_kickoff = next_game.kickoff.isoformat() if next_game.kickoff else None
            is_home = next_game.home_team_id == player.team_id
            opponent_id = next_game.away_team_id if is_home else next_game.home_team_id
            opp_rank = opponent_ranks.get((opponent_id, current_season)) if opponent_id else None
            opponent_rank = opp_rank
            opponent_team_count = 32 if opp_rank else None
            opponent_abbr = opponent_abbrs.get(opponent_id) if opponent_id else None

        player_logs = stats_by_player.get(player_id, [])
        split_hits, split_games = home_away_split_rate(player_logs, signal.stat_name, signal.threshold, is_home, min_season)
        h2h_hits, h2h_games = head_to_head_rate(player_logs, signal.stat_name, signal.threshold, opponent_id, min_season)

        without_player = None
        without_player_hits = None
        without_player_games = None
        team_absence = injury_impacts.get(player.team_id) if player.team_id else None
        if team_absence:
            teammate_name, missed_weeks = team_absence
            if teammate_name != player.full_name:
                imp_hits, imp_games = injury_impact_rate(player_logs, signal.stat_name, signal.threshold, missed_weeks)
                if imp_games >= 2:
                    without_player = teammate_name
                    without_player_hits = imp_hits
                    without_player_games = imp_games

        ci_low, ci_high = wilson_interval(hits, games)

        market_line = market_opening_line = market_price = market_implied_prob = None
        market_hits = market_games = edge = kelly = None
        market_match = _match_market_edge(
            market_odds_by_player.get(player_id, []), player_logs, signal.stat_name, signal.direction, min_season
        )
        if market_match:
            (
                market_line,
                market_price,
                market_implied_prob,
                market_hits,
                market_games,
                edge,
                market_opening_line,
                kelly,
            ) = market_match

        rows.append(
            CheatsheetRowOut(
                player_id=player_id,
                player_name=player.full_name,
                team=player.team.abbreviation if player.team else "",
                stat_name=signal.stat_name,
                threshold=signal.threshold,
                direction=signal.direction,
                hits=hits,
                games=games,
                hit_rate=round(hit_rate, 3),
                hit_rate_ci_low=round(ci_low, 3),
                hit_rate_ci_high=round(ci_high, 3),
                market_line=market_line,
                market_opening_line=market_opening_line,
                market_price=market_price,
                market_implied_prob=market_implied_prob,
                market_hits=market_hits,
                market_games=market_games,
                edge=edge,
                kelly_fraction=kelly,
                without_player=without_player,
                without_player_hits=without_player_hits,
                without_player_games=without_player_games,
                opponent_rank=opponent_rank,
                opponent_team_count=opponent_team_count,
                opponent_team=opponent_abbr,
                split_hits=split_hits if split_games > 0 else None,
                split_games=split_games if split_games > 0 else None,
                h2h_hits=h2h_hits if h2h_games > 0 else None,
                h2h_games=h2h_games if h2h_games > 0 else None,
                game_id=game_id,
                game_kickoff=game_kickoff,
                is_home=is_home,
            )
        )
    rows.sort(key=lambda r: (-r.hit_rate, -r.games))
    return rows


def build_trend_groups(rows: list[CheatsheetRowOut]) -> TrendGroupsOut:
    """Categorize cheatsheet rows into the Linemate-style signal-type buckets
    shown in the Cheatsheets widget. Extracted from the get_trend_groups route
    handler so the categorization logic is reusable/testable independent of
    the HTTP layer."""
    if not rows:
        return TrendGroupsOut(
            recent_form=[],
            versus_opponent=[],
            injury_impact=[],
            opponent_rank=[],
            home_away_splits=[],
            alternate_lines=[],
            unders_only=[],
            team_form=[],
        )

    # Priority 1: High hit rate signals (75%+)
    recent_form = [r for r in rows if r.hit_rate >= 0.75][:5]  # Strong recent form (75%+ hit rate)

    # Priority 2: Head-to-head signals — require the H2H history to actually
    # confirm the pick (>=50%), not just have some games on record (a 0/3
    # head-to-head record is evidence *against* the pick, not a signal for it).
    versus_opponent = [r for r in rows if r.h2h_games and r.h2h_hits is not None and r.h2h_hits / r.h2h_games >= 0.5][:5]

    # Priority 3: Home/Away splits — same confirming-evidence rule as above.
    home_away_splits = [
        r for r in rows if r.split_games and r.split_hits is not None and r.split_hits / r.split_games >= 0.5
    ][:5]

    # Priority 4: Opponent rank — only a genuine "edge" (weak defense for an
    # over, stingy defense for an under), not just any calculated rank.
    def _is_matchup_edge(r: CheatsheetRowOut) -> bool:
        if r.opponent_rank is None or not r.opponent_team_count:
            return False
        midpoint = r.opponent_team_count / 2
        return r.opponent_rank <= midpoint if r.direction == "under" else r.opponent_rank > midpoint

    opponent_rank = [r for r in rows if _is_matchup_edge(r)][:5]  # Ranked matchups

    # Priority 5: Injury impact — backed by real roster participation (see
    # batch_compute_injury_impacts), only when the "without teammate" games
    # actually confirm the pick.
    injury_impact = [
        r
        for r in rows
        if r.without_player_games and r.without_player_hits is not None and r.without_player_hits / r.without_player_games >= 0.5
    ][:5]

    # Fill remaining categories with top performers
    used_rows = set(id(r) for r in recent_form + versus_opponent + home_away_splits + opponent_rank + injury_impact)
    remaining = [r for r in rows if id(r) not in used_rows]

    # Alternate lines: overs/unders with good hit rates
    alternate_lines = [r for r in remaining if "over" in r.direction.lower() or "under" in r.direction.lower()][:5]

    # Unders only: specifically targeting under bets
    unders_only = [r for r in remaining if "under" in r.direction.lower()][:5]

    # Team form: remaining top performers
    team_form = remaining[5:10] if len(remaining) > 5 else []

    return TrendGroupsOut(
        recent_form=recent_form,
        versus_opponent=versus_opponent,
        injury_impact=injury_impact,
        opponent_rank=opponent_rank,
        home_away_splits=home_away_splits,
        alternate_lines=alternate_lines,
        unders_only=unders_only,
        team_form=team_form,
    )
