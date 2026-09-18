import os
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles

from app.core.sport_registry import SPORTS
from app.routers import board, games, matchup, odds, players, trends

app = FastAPI(title="Sports Stats & Trends API")

app.include_router(games.router, prefix="/api")
app.include_router(matchup.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(trends.router, prefix="/api")
app.include_router(odds.router, prefix="/api")
app.include_router(board.router, prefix="/api")

# Last time each sport's data was touched, in-memory — surfaced via /config so the
# frontend can show "Updated Xm ago" and know how fresh the board is.
_last_updated: dict[str, datetime] = {}


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
    }


@app.post("/api/{sport}/refresh")
def refresh_sport_scores(sport: str):
    """Manual, on-demand refresh of scores/status — fast enough to call from the UI."""
    if sport not in SPORTS:
        raise HTTPException(status_code=404, detail=f"Unknown sport '{sport}'")
    SPORTS[sport].refresh_scores()
    _last_updated[sport] = datetime.now(timezone.utc)
    return {"last_updated": _last_updated[sport].isoformat()}


scheduler = BackgroundScheduler()


def _refresh_all_sports_scores() -> None:
    for adapter in SPORTS.values():
        adapter.refresh_scores()
        _last_updated[adapter.slug] = datetime.now(timezone.utc)


def _run_all_sports_etl() -> None:
    for adapter in SPORTS.values():
        adapter.ingest_all()
        _last_updated[adapter.slug] = datetime.now(timezone.utc)


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
