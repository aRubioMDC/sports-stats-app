import json
import logging
import os
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .core.cache import clear_cache
from .core.sport_registry import SPORTS
from .db import SessionLocal
from .models import AnalyticsEvent
from .routers import board, games, matchup, odds, players, teams, trends

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("hitrate")

app = FastAPI(title="HitRate API")

# Enable CORS for frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5174", "http://localhost:4174", "http://127.0.0.1:5174", "http://127.0.0.1:4174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def log_unhandled_exceptions(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


app.include_router(games.router, prefix="/api")
app.include_router(matchup.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(teams.router, prefix="/api")
app.include_router(trends.router, prefix="/api")
app.include_router(odds.router, prefix="/api")
app.include_router(board.router, prefix="/api")

# Last time each sport's data was touched, in-memory — surfaced via /config so the
# frontend can show "Updated Xm ago" and know how fresh the board is.
_last_updated: dict[str, datetime] = {}

# Fase 4 candidate: gate these behind a subscription once free-usage traction is
# validated. No enforcement today — purely a marker for future scoping.
PREMIUM_CANDIDATE_FEATURES = ["advanced_tools", "parlays"]


class AnalyticsEventIn(BaseModel):
    event_name: str
    sport: str | None = None
    metadata: dict | None = None


@app.post("/api/events", status_code=204)
def track_event(event: AnalyticsEventIn):
    """Fire-and-forget anonymous usage event — no user accounts to tie this to yet."""
    db = SessionLocal()
    try:
        db.add(
            AnalyticsEvent(
                event_name=event.event_name,
                sport=event.sport,
                metadata_json=json.dumps(event.metadata)[:512] if event.metadata else None,
            )
        )
        db.commit()
    except Exception:
        logger.exception("Failed to record analytics event %s", event.event_name)
        db.rollback()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/sports")
def list_sports():
    return [{"slug": s.slug, "display_name": s.display_name} for s in SPORTS.values()]


@app.get("/api/{sport}/config")
def get_sport_config(sport: str):
    if sport not in SPORTS:
        raise HTTPException(status_code=404, detail=f"Unknown sport '{sport}'")
    # Determined dynamically per sport (e.g. via nflreadpy for NFL) — never hardcoded.
    adapter = SPORTS[sport]
    last_updated = _last_updated.get(sport)
    return {
        "current_season": adapter.current_season(),
        "current_week": adapter.current_week(),
        "last_updated": last_updated.isoformat() if last_updated else None,
        "period_unit": adapter.period_unit,
        "period_anchor_date": adapter.period_anchor_date(),
    }


@app.post("/api/{sport}/refresh")
def refresh_sport_scores(sport: str):
    """Manual, on-demand refresh of scores/status — fast enough to call from the UI."""
    if sport not in SPORTS:
        raise HTTPException(status_code=404, detail=f"Unknown sport '{sport}'")
    SPORTS[sport].refresh_scores()
    _last_updated[sport] = datetime.now(timezone.utc)
    clear_cache()
    return {"last_updated": _last_updated[sport].isoformat()}


scheduler = BackgroundScheduler()


def _refresh_all_sports_scores() -> None:
    for adapter in SPORTS.values():
        adapter.refresh_scores()
        _last_updated[adapter.slug] = datetime.now(timezone.utc)
    clear_cache()


def _run_all_sports_etl() -> None:
    for adapter in SPORTS.values():
        adapter.ingest_all()
        _last_updated[adapter.slug] = datetime.now(timezone.utc)
    clear_cache()


@app.on_event("startup")
def start_scheduler():
    # Run the full pipeline once immediately so a fresh deploy/restart doesn't sit on
    # stale scores for hours, then keep two cadences going:
    # - scores/status only, frequent (cheap: one schedule pull, catches live results fast)
    # - full stat rollups + trends, less frequent (expensive: touches every player/game)
    scheduler.add_job(_run_all_sports_etl, "date", id="etl_run_all_initial")
    scheduler.add_job(_refresh_all_sports_scores, "interval", minutes=15, id="etl_refresh_scores", replace_existing=True)
    scheduler.add_job(_run_all_sports_etl, "interval", hours=6, id="etl_run_all", replace_existing=True)
    scheduler.start()


@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown(wait=False)


frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
