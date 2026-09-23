"""Pull moneyline/spread/total + player prop odds from The Odds API (free tier).

Degrades gracefully: if the API key is missing or a request fails, this is a no-op
so the rest of the app keeps working with trend-only data (see plan assumptions).
"""

import httpx
from sqlalchemy import insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.config import settings
from app.db import SessionLocal
from app.models import Game, OddsEvent, OddsLine

SPORT_KEY = "americanfootball_nfl"
MARKETS = "h2h,spreads,totals"


def ingest_odds() -> None:
    if not settings.odds_api_key:
        return
    db: Session = SessionLocal()
    try:
        url = f"{settings.odds_api_base_url}/sports/{SPORT_KEY}/odds"
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
                home_abbr = event["home_team"][:3].upper()
                game = (
                    db.query(Game)
                    .filter(
                        Game.sport == "nfl",
                        Game.home_team.has(abbreviation=home_abbr),
                    )
                    .first()
                )
                if game is None:
                    continue
                
                # Use upsert to avoid duplicate key errors in concurrent requests
                stmt = pg_insert(OddsEvent).values(
                    game_id=game.id, 
                    external_event_id=event["id"]
                ).on_conflict_do_nothing(index_elements=['external_event_id'])
                
                db.execute(stmt)
                db.flush()
                
                # Re-fetch to get the actual ID (either newly inserted or existing)
                odds_event = (
                    db.query(OddsEvent).filter(OddsEvent.external_event_id == event["id"]).one()
                )

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
                                    outcome_name=outcome["name"],
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


if __name__ == "__main__":
    ingest_odds()
