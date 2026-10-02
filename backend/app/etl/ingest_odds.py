"""Pull moneyline/spread/total + player prop odds from The Odds API (free tier).

Degrades gracefully: if the API key is missing or a request fails, this is a no-op
so the rest of the app keeps working with trend-only data (see plan assumptions).
"""

import logging
import re
import unicodedata
from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..db import SessionLocal
from ..models import Game, OddsEvent, OddsLine, Player, PlayerPropOdds, Team

logger = logging.getLogger(__name__)

SPORT_KEY = "americanfootball_nfl"
# The Odds API sport key per sport we ingest game odds for.
ODDS_API_SPORT_KEYS = {"nfl": SPORT_KEY, "nhl": "icehockey_nhl"}
MARKETS = "h2h,spreads,totals"

# Each game-odds pull costs 3 credits (3 markets x 1 region) against a 500/month
# free tier shared by every sport, so pulls are throttled: not more often than
# this, and only while a game is about to start.
GAME_ODDS_MIN_REFRESH_HOURS = 12
GAME_ODDS_LOOKAHEAD_HOURS = 72
# Process-local memory of the last pull attempt, so a pull that matched no game
# (e.g. a naming mismatch) is not retried on every ETL run.
_last_game_odds_attempt: dict[str, datetime] = {}

# Maps our stat names to The Odds API's player-prop market keys.
STAT_TO_PLAYER_MARKET = {
    "receptions": "player_receptions",
    "receiving_yards": "player_reception_yds",
    "rushing_yards": "player_rush_yds",
    "passing_yards": "player_pass_yds",
}
PLAYER_PROP_MARKETS = ",".join(STAT_TO_PLAYER_MARKET.values())

# Player-prop pulls cost credits per event (unlike the single combined
# game-odds call above), so this runs far less often than run_all()'s normal
# cadence, and only for the small number of games about to kick off.
PLAYER_PROPS_MIN_REFRESH_HOURS = 20
PLAYER_PROPS_MAX_EVENTS_PER_RUN = 8
PLAYER_PROPS_LOOKAHEAD_DAYS = 3


def _normalize_name(name: str) -> str:
    """Loose match key so 'Michael Pittman Jr.' lines up with our stored full_name
    even if punctuation/suffix formatting differs slightly from the odds provider."""
    return re.sub(r"[^a-z0-9 ]", "", name.lower()).strip()


def normalize_team_name(name: str) -> str:
    """Lowercase, accent-free, punctuation-free key ("Montréal Canadiens" == "Montreal Canadiens")."""
    stripped = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9 ]", "", stripped.lower()).strip()


def team_name_matches(odds_name: str, team_name: str) -> bool:
    """True when the odds provider's team name is our team name, ignoring accents and
    case, or ends with it (our name may be just the nickname, e.g. "Bruins")."""
    odds_key = normalize_team_name(odds_name)
    team_key = normalize_team_name(team_name)
    if not odds_key or not team_key:
        return False
    return odds_key == team_key or odds_key.endswith(f" {team_key}")


def should_pull_game_odds(
    last_fetch: datetime | None,
    next_kickoff: datetime | None,
    now: datetime,
) -> bool:
    """Throttle rule: skip when odds were pulled recently or no game starts soon."""
    if last_fetch is not None and now - last_fetch < timedelta(hours=GAME_ODDS_MIN_REFRESH_HOURS):
        return False
    if next_kickoff is None or next_kickoff > now + timedelta(hours=GAME_ODDS_LOOKAHEAD_HOURS):
        return False
    return True


def _resolve_team(db: Session, sport: str, name: str) -> Team | None:
    """
    Team.name isn't unique — relocated franchises can leave stale alias rows
    with the same display name (see board.py's active-team-ids note on old
    LAR/OAK/SD/STL aliases) — so a plain equality lookup can return >1 row.
    Prefers whichever alias actually has games in the most recent season.
    """
    teams = [t for t in db.query(Team).filter(Team.sport == sport).all() if team_name_matches(name, t.name or "")]
    if not teams:
        return None
    if len(teams) == 1:
        return teams[0]
    return max(
        teams,
        key=lambda t: db.query(func.max(Game.season))
        .filter((Game.home_team_id == t.id) | (Game.away_team_id == t.id))
        .scalar()
        or 0,
    )


def _find_game_for_event(db: Session, sport: str, event: dict) -> Game | None:
    """
    Matches an odds-provider event to our Game row by home+away team full name
    (not the previous `team_name[:3]` truncation, which silently produced wrong
    abbreviations for most teams — e.g. "Kansas City Chiefs"[:3] is "KAN", not
    the real "KC" abbreviation — and had no season/status filter, so `.first()`
    could return an unrelated, already-final game from a prior season).

    Falls back to the schedule row whose kickoff is closest to the event's
    commence_time when a team's home/away games happen to collide.
    """
    home_team = _resolve_team(db, sport, event["home_team"])
    away_team = _resolve_team(db, sport, event["away_team"])
    if home_team is None or away_team is None:
        logger.warning("odds: no %s team match for %s @ %s", sport, event.get("away_team"), event.get("home_team"))
        return None
    candidates = (
        db.query(Game)
        .filter(
            Game.sport == sport,
            Game.home_team_id == home_team.id,
            Game.away_team_id == away_team.id,
            Game.status != "final",
        )
        .all()
    )
    if not candidates:
        return None
    if len(candidates) == 1:
        return candidates[0]
    try:
        commence = datetime.fromisoformat(event["commence_time"].replace("Z", "+00:00"))
        if commence.tzinfo is None:
            commence = commence.replace(tzinfo=timezone.utc)
        else:
            commence = commence.astimezone(timezone.utc)
        commence = commence.replace(tzinfo=None)
    except (KeyError, ValueError):
        return candidates[0]
    return min(candidates, key=lambda g: abs((g.kickoff - commence).total_seconds()) if g.kickoff else float("inf"))


def ingest_odds(sport: str = "nfl") -> None:
    """Game odds (moneyline/spread/total) for one sport. No-op without an API key,
    when throttled (see should_pull_game_odds), or for sports without an odds feed."""
    if not settings.odds_api_key or sport not in ODDS_API_SPORT_KEYS:
        return
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()
        last_fetch = (
            db.query(func.max(OddsEvent.fetched_at)).join(Game, Game.id == OddsEvent.game_id).filter(Game.sport == sport).scalar()
        )
        last_attempt = _last_game_odds_attempt.get(sport)
        if last_attempt is not None and (last_fetch is None or last_attempt > last_fetch):
            last_fetch = last_attempt
        next_kickoff = (
            db.query(func.min(Game.kickoff))
            .filter(Game.sport == sport, Game.status != "final", Game.kickoff.isnot(None), Game.kickoff >= now - timedelta(hours=6))
            .scalar()
        )
        if not should_pull_game_odds(last_fetch, next_kickoff, now):
            return
        _last_game_odds_attempt[sport] = now

        url = f"{settings.odds_api_base_url}/sports/{ODDS_API_SPORT_KEYS[sport]}/odds"
        params = {
            "apiKey": settings.odds_api_key,
            "regions": "us",
            "markets": MARKETS,
            "oddsFormat": "american",
        }
        response = httpx.get(url, params=params, timeout=30)
        response.raise_for_status()
        events = response.json()

        for event in events:
            try:
                game = _find_game_for_event(db, sport, event)
                if game is None:
                    continue
                # Odds outcomes are matched back to teams by Team.name (see routers/matchup.py),
                # so store our own spelling rather than the provider's.
                outcome_names = {
                    event["home_team"]: game.home_team.name,
                    event["away_team"]: game.away_team.name,
                }

                # Reconcile against both unique constraints explicitly (game_id
                # and external_event_id) instead of a single-column ON CONFLICT —
                # the provider can reissue a new event id for the same game, and
                # a prior buggy version of this matcher could have left a stale
                # row under either key, so a single-column upsert isn't enough.
                by_game = db.query(OddsEvent).filter(OddsEvent.game_id == game.id).one_or_none()
                by_ext_id = db.query(OddsEvent).filter(OddsEvent.external_event_id == event["id"]).one_or_none()
                if by_game and by_ext_id and by_game.id != by_ext_id.id:
                    db.delete(by_ext_id)
                    db.flush()
                    by_ext_id = None
                odds_event = by_game or by_ext_id
                if odds_event is None:
                    odds_event = OddsEvent(game_id=game.id, external_event_id=event["id"])
                    db.add(odds_event)
                else:
                    odds_event.game_id = game.id
                    odds_event.external_event_id = event["id"]
                odds_event.fetched_at = datetime.utcnow()
                db.flush()

                # Clear old odds lines and add new ones
                db.query(OddsLine).filter(OddsLine.odds_event_id == odds_event.id).delete()
                for bookmaker in event.get("bookmakers", []):
                    for market in bookmaker.get("markets", []):
                        for outcome in market.get("outcomes", []):
                            db.add(
                                OddsLine(
                                    odds_event_id=odds_event.id,
                                    bookmaker=bookmaker["key"],
                                    market=market["key"],
                                    outcome_name=outcome_names.get(outcome["name"], outcome["name"]),
                                    price=outcome["price"],
                                    point=outcome.get("point"),
                                )
                            )
            except Exception as e:
                # Log and continue with next event to avoid halting entire ingestion
                print(f"Error processing event {event.get('id')}: {e}")
                db.rollback()
                continue
        db.commit()
    except httpx.HTTPError as e:
        print(f"HTTP error fetching odds: {e}")
        db.rollback()
    except Exception as e:
        print(f"Unexpected error in ingest_odds: {e}")
        db.rollback()
    finally:
        db.close()


def _group_player_prop_outcomes(
    outcomes: list[dict],
) -> dict[tuple[str, float], dict[str, float]]:
    """Groups raw Over/Under outcome rows into one (description, line) -> prices dict."""
    grouped: dict[tuple[str, float], dict[str, float]] = {}
    for outcome in outcomes:
        description = outcome.get("description")
        point = outcome.get("point")
        if description is None or point is None:
            continue
        entry = grouped.setdefault((description, point), {})
        if outcome.get("name") == "Over":
            entry["over_price"] = outcome["price"]
        elif outcome.get("name") == "Under":
            entry["under_price"] = outcome["price"]
    return grouped


def ingest_player_prop_odds() -> None:
    """
    Pulls real player-prop lines (over/under price + line) for the handful of
    games about to kick off, and appends a new PlayerPropOdds snapshot each run
    (never deletes prior rows) so line movement can be tracked later — see
    `fetched_at` on PlayerPropOdds.

    Deliberately conservative: this endpoint is priced per event (unlike the
    single combined /odds call in ingest_odds), so it only runs once every
    `PLAYER_PROPS_MIN_REFRESH_HOURS`, and only for the soonest-kicking-off
    `PLAYER_PROPS_MAX_EVENTS_PER_RUN` games.
    """
    if not settings.odds_api_key:
        return
    db: Session = SessionLocal()
    try:
        last_fetch = db.query(func.max(PlayerPropOdds.fetched_at)).scalar()
        if last_fetch and datetime.utcnow() - last_fetch < timedelta(hours=PLAYER_PROPS_MIN_REFRESH_HOURS):
            return

        cutoff = datetime.utcnow() + timedelta(days=PLAYER_PROPS_LOOKAHEAD_DAYS)
        upcoming = (
            db.query(OddsEvent, Game)
            .join(Game, OddsEvent.game_id == Game.id)
            .filter(Game.status != "final", Game.kickoff.isnot(None), Game.kickoff <= cutoff)
            .order_by(Game.kickoff.asc())
            .limit(PLAYER_PROPS_MAX_EVENTS_PER_RUN)
            .all()
        )
        if not upcoming:
            return

        name_lookup = {
            _normalize_name(full_name): player_id
            for player_id, full_name in db.query(Player.id, Player.full_name).filter(Player.sport == "nfl")
        }

        for odds_event, game in upcoming:
            try:
                url = f"{settings.odds_api_base_url}/sports/{SPORT_KEY}/events/{odds_event.external_event_id}/odds"
                params = {
                    "apiKey": settings.odds_api_key,
                    "regions": "us",
                    "markets": PLAYER_PROP_MARKETS,
                    "oddsFormat": "american",
                }
                response = httpx.get(url, params=params, timeout=30)
                response.raise_for_status()
                event_odds = response.json()

                snapshot_time = datetime.utcnow()
                for bookmaker in event_odds.get("bookmakers", []):
                    for market in bookmaker.get("markets", []):
                        if market["key"] not in STAT_TO_PLAYER_MARKET.values():
                            continue
                        grouped = _group_player_prop_outcomes(market.get("outcomes", []))
                        for (description, point), prices in grouped.items():
                            player_id = name_lookup.get(_normalize_name(description))
                            if player_id is None:
                                continue
                            db.add(
                                PlayerPropOdds(
                                    odds_event_id=odds_event.id,
                                    player_id=player_id,
                                    market=market["key"],
                                    bookmaker=bookmaker["key"],
                                    line=point,
                                    over_price=prices.get("over_price"),
                                    under_price=prices.get("under_price"),
                                    fetched_at=snapshot_time,
                                )
                            )
                db.commit()
            except Exception as e:
                print(f"Error processing player props for event {odds_event.external_event_id}: {e}")
                db.rollback()
                continue
    except Exception as e:
        print(f"Unexpected error in ingest_player_prop_odds: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    ingest_odds()
    ingest_player_prop_odds()

