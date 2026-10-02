import json
import logging
import os
import asyncio
from datetime import datetime, timezone
from contextlib import asynccontextmanager

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .core.cache import clear_cache
from .core.sport_registry import SPORTS
from .db import SessionLocal, get_db
from .models import AnalyticsEvent, Game
from .routers import board, games, matchup, odds, players, teams, trends
from sqlalchemy.orm import Session

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("hitrate")

scheduler = BackgroundScheduler()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Run the full pipeline once immediately so a fresh deploy/restart doesn't sit on
    # stale scores for hours, then keep two cadences going:
    # - scores/status only, frequent (cheap: one schedule pull, catches live results fast)
    # - full stat rollups + trends, less frequent (expensive: touches every player/game)
    scheduler.add_job(_run_all_sports_etl, "date", id="etl_run_all_initial")
    scheduler.add_job(_refresh_all_sports_scores, "interval", minutes=1, id="etl_refresh_scores", replace_existing=True)
    scheduler.add_job(_run_all_sports_etl, "interval", hours=6, id="etl_run_all", replace_existing=True)
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown(wait=False)


app = FastAPI(title="HitRate API", lifespan=lifespan)

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

# Live-only marker incremented per sport on each cheap scores refresh. SSE clients
# watch only their sport's version and refresh just score-sensitive UI slices.
_scores_refresh_version_by_sport: dict[str, int] = {slug: 0 for slug in SPORTS}

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
def get_sport_config(sport: str, db: Session = Depends(get_db)):
    if sport not in SPORTS:
        raise HTTPException(status_code=404, detail=f"Unknown sport '{sport}'")
    # Determined dynamically per sport (e.g. via nflreadpy for NFL) — never hardcoded.
    adapter = SPORTS[sport]
    last_updated = _last_updated.get(sport)
    season = adapter.current_season()
    default_period = _recommended_period(db, sport=sport, season=season, fallback=adapter.current_week())
    period_min, period_max = _period_bounds(db, sport=sport, season=season)
    return {
        "current_season": season,
        "current_week": adapter.current_week(),
        "recommended_period": default_period,
        "period_min": period_min,
        "period_max": period_max,
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
    _scores_refresh_version_by_sport[sport] = _scores_refresh_version_by_sport.get(sport, 0) + 1
    clear_cache()
    return {"last_updated": _last_updated[sport].isoformat()}


def _period_bounds(db: Session, sport: str, season: int) -> tuple[int, int]:
    rows = db.query(Game.week).filter(Game.sport == sport, Game.season == season).all()
    if not rows:
        return (1, 1)
    weeks = [int(row[0]) for row in rows]
    return (min(weeks), max(weeks))


def _recommended_period(db: Session, sport: str, season: int, fallback: int) -> int:
    """Prefer the next scheduled period, then the latest seen one, then fallback.

    This keeps Home/board aligned with real scheduled data instead of surfacing an
    empty period when adapter.current_week() is outside the loaded schedule window.
    """
    now = datetime.now(timezone.utc)

    upcoming = (
        db.query(Game.week)
        .filter(
            Game.sport == sport,
            Game.season == season,
            Game.kickoff.is_not(None),
            Game.kickoff >= now,
        )
        .order_by(Game.kickoff.asc())
        .first()
    )
    if upcoming:
        return int(upcoming[0])

    latest = (
        db.query(Game.week)
        .filter(Game.sport == sport, Game.season == season)
        .order_by(Game.week.desc())
        .first()
    )
    if latest:
        return int(latest[0])

    return fallback


def _refresh_all_sports_scores() -> None:
    for adapter in SPORTS.values():
        adapter.refresh_scores()
        _last_updated[adapter.slug] = datetime.now(timezone.utc)
        _scores_refresh_version_by_sport[adapter.slug] = _scores_refresh_version_by_sport.get(adapter.slug, 0) + 1
    clear_cache()


def _run_all_sports_etl() -> None:
    for adapter in SPORTS.values():
        adapter.ingest_all()
        _last_updated[adapter.slug] = datetime.now(timezone.utc)
    clear_cache()


@app.get("/api/{sport}/scores/stream")
def stream_sport_scores(sport: str):
    """SSE stream for live score/status refresh signals (no full-page reload)."""
    if sport not in SPORTS:
        raise HTTPException(status_code=404, detail=f"Unknown sport '{sport}'")

    async def event_stream():
        # Push an initial signal so the frontend can sync immediately on connect.
        initial_payload = {
            "sport": sport,
            "version": _scores_refresh_version_by_sport.get(sport, 0),
            "last_updated": _last_updated.get(sport).isoformat() if _last_updated.get(sport) else None,
        }
        yield f"event: scores_refresh\ndata: {json.dumps(initial_payload)}\n\n"

        last_seen_version = _scores_refresh_version_by_sport.get(sport, 0)
        keepalive_ticks = 0
        while True:
            current_version = _scores_refresh_version_by_sport.get(sport, 0)
            if current_version != last_seen_version:
                payload = {
                    "sport": sport,
                    "version": current_version,
                    "last_updated": _last_updated.get(sport).isoformat() if _last_updated.get(sport) else None,
                }
                yield f"event: scores_refresh\ndata: {json.dumps(payload)}\n\n"
                last_seen_version = current_version
                keepalive_ticks = 0
            else:
                # Keep proxies/connections alive with an SSE comment every ~15s.
                keepalive_ticks += 1
                if keepalive_ticks >= 5:
                    yield ": keepalive\n\n"
                    keepalive_ticks = 0
            await asyncio.sleep(3)

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }
    return StreamingResponse(event_stream(), media_type="text/event-stream", headers=headers)


frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
