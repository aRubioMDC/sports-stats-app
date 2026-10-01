"""Pull real per-game skater box scores from the NHL API (roster + player game
logs) and upsert Player + HockeyPlayerGameStat rows — the NHL counterpart of
ingest_player_stats.py. Goalies are skipped: their stat shape (saves, goals
against) doesn't fit a skater's goals/assists/points/shots.
"""

from sqlalchemy.orm import Session

from ..db import SessionLocal
from ..models import Game, HockeyPlayerGameStat, Player, Team
from .nhl_client import get_player_game_log, get_roster


def external_player_id(nhl_player_id: int) -> str:
    return f"nhl_{nhl_player_id}"


def _upsert_roster_players(db: Session, team_ids: dict[str, int]) -> dict[int, int]:
    """Returns real NHL player id -> our Player.id, for every current skater
    (forwards + defensemen) across all rostered teams."""
    players_by_gsis = {p.gsis_id: p for p in db.query(Player).filter(Player.sport == "nhl").all()}
    nhl_id_to_our_id: dict[int, int] = {}
    for abbr, team_id in team_ids.items():
        roster = get_roster(abbr)
        for skater in [*roster.get("forwards", []), *roster.get("defensemen", [])]:
            gsis_id = external_player_id(skater["id"])
            full_name = f"{skater['firstName']['default']} {skater['lastName']['default']}"
            player = players_by_gsis.get(gsis_id)
            if player is None:
                player = Player(
                    sport="nhl",
                    gsis_id=gsis_id,
                    full_name=full_name,
                    position=skater.get("positionCode", ""),
                    team_id=team_id,
                    headshot_url=skater.get("headshot", "") or "",
                )
                db.add(player)
                db.flush()  # need player.id for the game-stat key below
                players_by_gsis[gsis_id] = player
            player.full_name = full_name
            player.position = skater.get("positionCode", "")
            player.team_id = team_id
            player.headshot_url = skater.get("headshot", "") or ""
            nhl_id_to_our_id[skater["id"]] = player.id
    db.commit()
    return nhl_id_to_our_id


def ingest_player_stats_nhl(season: int) -> None:
    """Pulls real per-game skater logs for the blended window the small-sample
    rule needs early in a season: last season's real regular-season games, this
    season's real preseason games (finished before opening night, so real
    results — not guessed), and this season's real regular-season games so far.
    All three are genuinely-played games; nothing here is fabricated, just a
    wider real sample so a brand-new season isn't stuck with zero signal."""
    db: Session = SessionLocal()
    try:
        team_ids = {t.abbreviation: t.id for t in db.query(Team).filter(Team.sport == "nhl").all()}
        if not team_ids:
            return
        nhl_id_to_our_id = _upsert_roster_players(db, team_ids)

        previous_season = season - 10001  # NHL season ids are dual-year (20262027 -> 20252026)
        seasons_to_fetch = {previous_season, season}
        games_by_external_id = {
            g.nflverse_game_id: g
            for g in db.query(Game).filter(Game.sport == "nhl", Game.season.in_(seasons_to_fetch)).all()
        }
        existing_stats = {
            (s.player_id, s.nhl_game_id): s
            for s in db.query(HockeyPlayerGameStat)
            .filter(HockeyPlayerGameStat.season.in_(seasons_to_fetch))
            .all()
        }

        # (season to tag the rows with, season to query the API for, game type)
        # — preseason games carry the *current* season's id in the real data.
        fetch_plan = [
            (previous_season, previous_season, 2),  # last season, regular season
            (season, season, 1),  # this season's real preseason, just finished
            (season, season, 2),  # this season's regular season so far
        ]

        for player_index, (nhl_player_id, player_id) in enumerate(nhl_id_to_our_id.items()):
            for tag_season, fetch_season, game_type in fetch_plan:
                game_log = get_player_game_log(nhl_player_id, fetch_season, game_type=game_type)
                for entry in game_log:
                    nhl_game_id = entry["gameId"]
                    key = (player_id, nhl_game_id)
                    stat = existing_stats.get(key)
                    if stat is None:
                        stat = HockeyPlayerGameStat(player_id=player_id, nhl_game_id=nhl_game_id, season=tag_season)
                        db.add(stat)
                        existing_stats[key] = stat
                    game_row = games_by_external_id.get(f"nhl_{nhl_game_id}")
                    stat.game_id = game_row.id if game_row else None
                    stat.game_date = entry.get("gameDate", "")
                    stat.opponent_team_id = team_ids.get(entry.get("opponentAbbrev"))
                    stat.is_home = entry.get("homeRoadFlag") == "H"
                    stat.goals = entry.get("goals", 0) or 0
                    stat.assists = entry.get("assists", 0) or 0
                    stat.points = entry.get("points", 0) or 0
                    stat.shots_on_goal = entry.get("shots", 0) or 0
            # Flush in small batches — same rationale as ingest_player_stats.py
            # (a pooled remote connection enforces a per-statement timeout).
            if player_index % 50 == 49:
                db.flush()
        db.commit()
    finally:
        db.close()
