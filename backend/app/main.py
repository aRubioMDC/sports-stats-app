import os

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.core.sport_registry import SPORTS
from app.routers import games, matchup, odds, players, trends

app = FastAPI(title="Sports Stats & Trends API")

app.include_router(games.router, prefix="/api")
app.include_router(matchup.router, prefix="/api")
app.include_router(players.router, prefix="/api")
app.include_router(trends.router, prefix="/api")
app.include_router(odds.router, prefix="/api")


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/sports")
def list_sports():
    return [{"slug": s.slug, "display_name": s.display_name} for s in SPORTS.values()]


scheduler = BackgroundScheduler()


def _run_all_sports_etl() -> None:
    for adapter in SPORTS.values():
        adapter.ingest_all()


@app.on_event("startup")
def start_scheduler():
    # Daily stats refresh, more frequent odds refresh during game weeks.
    scheduler.add_job(_run_all_sports_etl, "interval", hours=6, id="etl_run_all", replace_existing=True)
    scheduler.start()


@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown(wait=False)


frontend_dist = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
