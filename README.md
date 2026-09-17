# NFL Stats & Trends

A ValueStats + Linemate hybrid, scoped to the NFL: pre-game matchup context (team
averages, ranks, head-to-head history) and player hit-rate trend cheatsheets, built
on free real NFL data.

## Stack
- **Backend**: FastAPI + SQLAlchemy + Alembic, ETL powered by [`nflreadpy`](https://github.com/nflverse/nflreadpy) (nflverse data)
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Database**: Postgres (Neon free tier recommended)
- **Odds** (optional): [The Odds API](https://the-odds-api.com/) free tier
- **Hosting**: Railway (single Docker service; see `infra/Dockerfile`)

## Local development

### Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
copy .env.example .env   # fill in DATABASE_URL, ODDS_API_KEY
.\.venv\Scripts\python.exe -m alembic upgrade head   # or Base.metadata.create_all for local sqlite
.\.venv\Scripts\python.exe -m app.etl.run_all         # initial data backfill
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```
The Vite dev server proxies `/api/*` to `http://localhost:8000`.

## Business rule: small-sample blending
If a team (or player) has played `<= SMALL_SAMPLE_WEEK_THRESHOLD` games in the
current season (default 3), stats and hit-rate trends are computed by pooling the
full previous season's games together with the current season's games so far.
Once past the threshold, only the current season is used. See
`backend/app/etl/stat_window.py`.

## Deployment (Railway)
1. Create a free Postgres database (Neon recommended) and copy its connection string.
2. In Railway, create a project from this repo; it will build via `infra/Dockerfile`.
3. Set env vars: `DATABASE_URL`, `ODDS_API_KEY` (optional), `CURRENT_SEASON`.
4. Add a Railway cron (or scheduled job) to run `python -m app.etl.run_all` periodically
   to refresh schedules, stats, trends, and odds.
