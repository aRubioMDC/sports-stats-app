"""Pull real team standings + season schedule/results from the free NHL API
(api-web.nhle.com) and upsert Team + Game rows — the NHL counterpart of
ingest_schedules.py.
"""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import text
from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Game, Team
from .nhl_client import get_schedule, get_standings_now

APP_TIMEZONE = ZoneInfo("America/Mexico_City")

# Real NHL API game ids are numeric (e.g. 2026020053); prefixed so they can share
# Game.nflverse_game_id's unique string column with NFL's own string game ids.
def external_game_id(nhl_game_id: int) -> str:
    return f"nhl_{nhl_game_id}"


def upsert_teams_nhl(db: Session) -> dict[str, int]:
    standings = get_standings_now()
    abbrev_to_id: dict[str, int] = {}
    for row in standings:
        abbrev = row["teamAbbrev"]["default"]
        team = db.query(Team).filter(Team.sport == "nhl", Team.abbreviation == abbrev).one_or_none()
        if team is None:
            team = Team(sport="nhl", abbreviation=abbrev)
            db.add(team)
        team.name = row["teamName"]["default"]
        team.conference = row.get("conferenceName", "") or ""
        team.division = row.get("divisionName", "") or ""
        team.logo_url = row.get("teamLogo", "") or ""
        db.flush()
        abbrev_to_id[abbrev] = team.id
    db.commit()
    return abbrev_to_id


def season_anchor_date(season: int) -> date:
    """The real date that week==0 corresponds to for a given season — shared
    by _week_number and the adapter's period_anchor_date()."""
    return date(season // 10000, 9, 1)


def _week_number(game_date: date, season: int) -> int:
    """Real day-of-season index (days since Sept 1 of the season's start year).
    The NHL has no native "week" concept — games run nearly daily — so each
    real day gets its own bucket; the frontend renders this as an actual
    calendar date (see SportAdapter.period_unit/period_anchor_date) instead of
    a misleading "Week N" label."""
    return (game_date - season_anchor_date(season)).days


def _local_date_from_utc_naive(value: datetime) -> date:
    # Stored kickoff values are UTC-naive in DB; convert to app-local day buckets.
    utc_aware = value.replace(tzinfo=timezone.utc)
    return utc_aware.astimezone(APP_TIMEZONE).date()


def _upsert_game(
    db: Session,
    game: dict,
    team_ids: dict[str, int],
    games_by_external_id: dict[str, Game],
    week_key_owners: dict[tuple[int, int, int, int], str],
) -> None:
    home_abbr = game["homeTeam"]["abbrev"]
    away_abbr = game["awayTeam"]["abbrev"]
    if home_abbr not in team_ids or away_abbr not in team_ids:
        return
    if game.get("gameType") == 1:
        # Preseason exhibition game — real NHL standings never count these, so
        # including them would inflate team records/form with results that
        # don't belong in the regular-season picture (see game_type comment
        # on the Game model: only "REG"/"POST" are meant to reach standings).
        return
    kickoff = datetime.fromisoformat(game["startTimeUTC"].replace("Z", "+00:00"))
    if kickoff.tzinfo is None:
        kickoff = kickoff.replace(tzinfo=timezone.utc)
    else:
        kickoff = kickoff.astimezone(timezone.utc)
    kickoff = kickoff.replace(tzinfo=None)
    season = int(game["season"])
    home_id, away_id = team_ids[home_abbr], team_ids[away_abbr]

    external_id = external_game_id(game["id"])
    row = games_by_external_id.get(external_id)
    if row is None:
        row = Game(
            sport="nhl",
            nflverse_game_id=external_id,
            season=season,
            week=0,
            home_team_id=home_id,
            away_team_id=away_id,
        )
        db.add(row)
        games_by_external_id[external_id] = row

    week = _week_number(_local_date_from_utc_naive(kickoff), season)
    key = (season, week, home_id, away_id)
    # Nudge forward on the rare occasion two distinct real NHL game ids land on
    # the same (season, week, home, away) bucket (e.g. a suspended-and-resumed
    # game recorded under two ids) so the DB's one-meeting-per-bucket
    # constraint — the same assumption the NFL side relies on — always holds.
    while week_key_owners.get(key, external_id) != external_id:
        week += 1
        key = (season, week, home_id, away_id)
    week_key_owners[key] = external_id

    row.season = season
    row.week = week
    row.game_type = "POST" if game.get("gameType") == 3 else "REG"
    row.kickoff = kickoff
    row.home_team_id = home_id
    row.away_team_id = away_id
    row.home_score = game["homeTeam"].get("score")
    row.away_score = game["awayTeam"].get("score")
    row.status = "final" if game.get("gameState") in ("OFF", "FINAL") else "scheduled"


# Bounded so one run makes a sane number of real API calls (each covers ~1 week);
# high enough to walk the whole Oct-June regular season without an unbounded loop.
MAX_SCHEDULE_PAGES = 45


def _walk_pages(
    db: Session,
    start_date: str,
    team_ids: dict[str, int],
    games_by_external_id: dict[str, Game],
    week_key_owners: dict[tuple[int, int, int, int], str],
    cursor_field: str,
    max_pages: int,
) -> None:
    """Walks schedule pages in one direction (forward via nextStartDate, or
    backward via previousStartDate) until the API stops returning a cursor."""
    cursor = start_date
    seen: set[str] = set()
    for _ in range(max_pages):
        if cursor in seen:
            break
        seen.add(cursor)
        payload = get_schedule(cursor)
        for week in payload.get("gameWeek", []):
            for game in week.get("games", []):
                _upsert_game(db, game, team_ids, games_by_external_id, week_key_owners)
        db.commit()
        next_cursor = payload.get(cursor_field)
        if not next_cursor:
            break
        cursor = next_cursor


def ingest_schedule_nhl(start_date: str = "now", max_pages: int = MAX_SCHEDULE_PAGES) -> None:
    """Walks the schedule both forward and backward from `start_date` so the
    whole season is covered regardless of where "now" falls — pulling forward
    only (as an earlier version of this did) left every week before today
    without any real games, which made bye-week/board views for past weeks
    falsely show every team as on bye instead of "no data ingested yet".

    `max_pages` lets the cheap/frequent refresh_scores() path (called every 15
    minutes) only revisit the few days around "now" instead of re-walking the
    entire season every time — the full historical backfill only needs to run
    once (run_all_nhl's ingest_all path)."""
    db = SessionLocal()
    try:
        team_ids = upsert_teams_nhl(db)
        games_by_external_id: dict[str, Game] = {
            g.nflverse_game_id: g for g in db.query(Game).filter(Game.sport == "nhl").all()
        }
        week_key_owners: dict[tuple[int, int, int, int], str] = {
            (g.season, g.week, g.home_team_id, g.away_team_id): g.nflverse_game_id
            for g in games_by_external_id.values()
        }

        _walk_pages(db, start_date, team_ids, games_by_external_id, week_key_owners, "nextStartDate", max_pages)
        _walk_pages(db, start_date, team_ids, games_by_external_id, week_key_owners, "previousStartDate", max_pages)
    finally:
        db.close()


def recompute_weeks_nhl() -> None:
    """One-off fixup for rows written under an earlier version of _week_number
    (e.g. calendar-week instead of day-of-season) — recomputes `week` from each
    game's already-stored real kickoff, no API calls needed.

    Done as a single SQL UPDATE (real date arithmetic, matching _week_number)
    against a temporarily-dropped unique constraint — an ORM row-by-row
    two-phase update still collides transiently (Postgres checks the
    constraint per-statement, not at the end of the transaction, so the order
    UPDATEs land in matters) and is far slower against a remote DB. Any
    genuine remaining collision (two real games, same two teams, same
    calendar day — rare, but does happen) is nudged forward a day so the
    constraint can be restored; nothing is silently dropped.
    """
    db = SessionLocal()
    try:
        db.execute(text("ALTER TABLE games DROP CONSTRAINT games_sport_season_week_home_team_id_away_team_id_key"))
        db.execute(
            text(
                "UPDATE games SET week = (kickoff::date - make_date((season/10000), 9, 1)) WHERE sport = 'nhl'"
            )
        )
        db.commit()

        for _ in range(50):  # bounded safety net against a pathological chain of same-day collisions
            dupes = db.execute(
                text(
                    """
                    SELECT array_agg(id ORDER BY id) FROM games WHERE sport = 'nhl'
                    GROUP BY sport, season, week, home_team_id, away_team_id
                    HAVING count(*) > 1
                    """
                )
            ).all()
            if not dupes:
                break
            for (ids,) in dupes:
                for game_id in ids[1:]:  # keep the first, nudge the rest forward a day
                    db.execute(text("UPDATE games SET week = week + 1 WHERE id = :id"), {"id": game_id})
            db.commit()

        db.execute(
            text(
                "ALTER TABLE games ADD CONSTRAINT games_sport_season_week_home_team_id_away_team_id_key "
                "UNIQUE (sport, season, week, home_team_id, away_team_id)"
            )
        )
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    ingest_schedule_nhl()
