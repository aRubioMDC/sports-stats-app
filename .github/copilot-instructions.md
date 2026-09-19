# SportStats — Agent Instructions

NFL stats/betting-decision web app fusing **ValueStats** (match-context stats) and
**Linemate** (player prop trends/hit-rates), built on free real data via `nflreadpy`.

## Product roadmap (do not skip ahead)

- **Fase 1 (current)**: finish the core tool — one sport (NFL), free, stable, no auth.
- **Fase 2**: add more sports/leagues (reuse the `SportAdapter` pattern).
- **Fase 3**: refine existing tools, add more.
- **Fase 4**: after a free-usage period validates traction, evaluate gating
  Advanced Tools / Parlays behind a paid subscription.

Do NOT implement any paywall/limiting logic now — it's a Fase 4 idea, not scoped yet.
When adding features, prefer marking them as "premium-candidate" conceptually
(e.g. a comment or a simple flag) rather than building any enforcement.

## Architecture

- **Backend**: Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, Pydantic v2,
  APScheduler (BackgroundScheduler). Modular monolith with a `SportAdapter`
  protocol (`app/core/sport_adapter.py`) — NFL (`app/sports/nfl_adapter.py`) is the
  only implementation so far; keep new sports behind the same interface.
- **Data source**: `nflreadpy` (polars-based). `truststore.inject_into_ssl()` is
  required at process start to bypass corporate proxy SSL issues (see `app/main.py`
  and test files).
- **Database**: Supabase Postgres via the **Session Pooler** connection string —
  direct IPv6 connection does NOT work on this network. Configured via
  `DATABASE_URL` / `backend/.env` (see `backend/app/config.py`, `Settings`).
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4, react-router-dom.
- **Deploy target**: Railway. `railway.toml` and `infra/Dockerfile` already exist.
  `GET /api/health` is the health-check endpoint.
- **Repo**: `https://github.com/aRubioMDC/sports-stats-app`, branch `main`.

## Getting started / dev commands

- Backend env vars (`backend/.env`, see `backend/.env.example`): `DATABASE_URL`
  (Supabase Session Pooler string), `ODDS_API_KEY` (optional), `SMALL_SAMPLE_WEEK_THRESHOLD=3`.
- Run backend (from `backend/`): `.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`
- Run frontend (from `frontend/`): `npm run dev` (Vite, default port 5173)
- Run backend smoke tests (from `backend/`): `.\.venv\Scripts\python.exe -m pytest tests\test_smoke.py -v`
- Typecheck + build frontend (from `frontend/`): `npx tsc --noEmit; npm run build`
- ETL manual full run: `python -m app.etl.run_all` (also runs automatically on
  startup + every 6h via the scheduler in `main.py`)

### Backend structure (`backend/app/`)
- `main.py` — FastAPI app entrypoint, scheduler setup, `/api/health`,
  `/api/sports`, `/api/{sport}/config`, `/api/{sport}/refresh`.
- `db.py` — SQLAlchemy session/engine (`SessionLocal`). Import as `from app.db import SessionLocal`, NOT `app.database`.
- `models.py` — SQLAlchemy models (Game, Player, PlayerTrendSignal, PlayerWeeklyStat, Team, TeamSeasonStats).
- `schemas.py` — Pydantic response models (BoardGameOut, CheatsheetRowOut, GameOut, ParlayOut, TrendGroupsOut, etc).
- `config.py` — `Settings` (pydantic-settings), incl. `small_sample_week_threshold=3`.
- `core/` — `sport_adapter.py` (Protocol), `sport_registry.py` (`SPORTS` dict).
- `etl/` — ingestion + trend computation (`ingest_schedules.py`, `ingest_player_stats.py`,
  `ingest_team_stats.py`, `compute_trends.py`, `run_all.py`).
- `routers/` — `board.py` (core landing-page/trends logic: cheatsheets, advanced
  tools, parlays, team-level market trends — the biggest/most complex file),
  plus `games.py`, `matchup.py`, `players.py`, `trends.py`, `odds.py`.
- `sports/nfl_adapter.py` — NflAdapter (`current_season()`, `current_week()`,
  `ingest_all()`, `refresh_scores()`).
- `tests/test_smoke.py` — read-only smoke tests against the real dev DB via
  FastAPI `TestClient`. Run with `pytest tests/test_smoke.py -v`.

### Frontend structure (`frontend/src/`)
- `api.ts` — typed API client (all request/response types + `api.*` methods).
- `pages/Home.tsx` — main landing page orchestrating all widgets. Default status
  filter is `"scheduled"` (Upcoming), not `"all"`.
- `components/` — `MatchRow.tsx` (ValueStats-style row w/ team-level trends),
  `CheatsheetGroups.tsx` (paged carousel, `PAGE_SIZE=3`, 6 categories),
  `AdvancedToolsWidget.tsx` (Injuries/Opponent Rank mode dropdown; uses a
  `trimToGrid()` helper to always show exactly 3 or 6 cards, never a ragged row),
  `ParlaysWidget.tsx` (game-switcher + multi-slate carousel), `Layout.tsx`.
- `lib/statLabels.ts` — shared stat-name-to-label formatting
  (`formatTrendLine`, `formatMarketTrendLine`).

## Database structure (`backend/app/models.py`)

All tables are multi-sport-ready via a `sport` column (default `"nfl"`), even
though NFL is the only sport implemented so far.

- **`teams`** — `sport`, `abbreviation` (unique per sport), `name`, `conference`,
  `division`, `primary_color`, `logo_url`. NOTE: carries stale relocated-franchise
  alias rows (old LAR/OAK/SD/STL) from `nflreadpy.load_teams()` history — always
  filter to `_active_team_ids()` (current season's schedule) rather than querying
  this table raw, or counts inflate from 32 to 36.
- **`games`** — unique per `(sport, season, week, home_team_id, away_team_id)`,
  keyed externally by `nflverse_game_id`. `game_type` = REG/POST. `kickoff` =
  `gameday`+`gametime` combined (see gotchas). `status` = scheduled/final.
  FKs to `teams` for home/away.
- **`team_season_stats`** — one row per `(team_id, season)`, precomputed
  aggregates refreshed by ETL (points/yards per game, time of possession, sacks,
  INTs, turnover differential) plus their league ranks. `window_mode` = "blended"
  (pools current+previous season when `weeks_played <= small_sample_week_threshold`)
  or "current".
- **`players`** — keyed externally by `gsis_id`. FK to current `team_id`
  (nullable — unattached/retired players).
- **`player_weekly_stats`** — raw per-game stat line, **source of truth** for all
  rolling hit-rate calculations. Unique per `(player_id, season, week)`. Has
  `opponent_team_id`, `is_home`, and the raw stat columns (receptions,
  receiving/rushing/passing yards, TDs). NOTE: as of this session, ~18,961
  orphaned 2024-season rows (no matching `Game`) were deleted — any new raw scan
  of this table MUST go through `_window_seasons(sport)` in `board.py` to avoid
  reintroducing that class of bug.
- **`player_trend_signals`** — precomputed hit-rate signal per
  `(player, stat_name, threshold, direction)`, refreshed by ETL. Tracks
  `recent_form_hits/games`, `h2h_hits/games` (vs specific opponent), `split_hits/games`
  (home/away), and `opponent_rank`. This is what powers Cheatsheets/Advanced Tools/Parlays.
- **`odds_events`** / **`odds_lines`** / **`player_prop_odds`** — optional
  sportsbook odds integration (moneyline/spread/total + player props), one
  `odds_event` per game, fetched from an external odds API when configured
  (`odds_api_key` in `Settings`). Not required for the app to function — trend
  computations don't depend on these being populated.
- **`analytics_events`** — anonymous usage event log (`event_name`, `sport`,
  `metadata_json`, `created_at`). No FK to a user (no auth yet). Written via
  `POST /api/events`, called fire-and-forget from the frontend's `api.trackEvent()`.

## Conventions / gotchas learned this session

- **Season/week are always dynamic** via `nflreadpy` — never hardcode a season or
  week number anywhere in backend or frontend.
- **Playoffs already work**: NFL weeks 19-22 (wildcard → Super Bowl) are ingested
  with real dates under the same numeric `week` column; the frontend week
  selector already goes up to 22. No special-casing needed.
- **`_window_seasons(sport)`** (in `board.py`) restricts queries to
  `[current_season-1, current_season]` — guards against stale/orphaned rows from
  old seasons. Apply this guard to any new raw `PlayerWeeklyStat`/stat scan.
- **`_active_team_ids(db, sport)`** (in `board.py`) filters to teams actually in
  the current season's schedule — the `Team` table has stale relocated-franchise
  alias rows (old LAR/OAK/SD/STL) that inflate counts from 32 to 36 if not filtered.
- **Kickoff time** = `gameday` + `gametime` combined (not just `gameday`, which
  defaults to midnight and breaks live/final status detection).
- **Scheduler** (`main.py`): 3 APScheduler jobs — one-time full ETL on startup,
  `_refresh_all_sports_scores` every 15 min (lightweight, `ingest_schedules` only),
  `_run_all_sports_etl` every 6 hours (full pipeline). `_last_updated` dict tracks
  freshness per sport, exposed via `/api/{sport}/config`.
- Em-dash characters in JSX: use the literal "—" character or `{"\u2014"}` —
  typing the literal text `\u2014` renders as garbage.
- PowerShell terminal: `cd` combined with other commands on one line sometimes
  gets dropped by the tool. If a command fails with "not recognized", resend the
  full `cd "..."; <command>` line again — it often works on retry.
- Uvicorn dev run: `cd backend; .\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000`.
  Free port 8000 first if reusing: `Get-NetTCPConnection -LocalPort 8000 -State Listen | ... | Stop-Process -Force`.

## Git workflow (user preference — see also user-level memory)

- **Never run `git commit` without explicit user confirmation.**
- When staging a large/mixed batch of changes, split into logical commits by
  feature/concern (e.g. backend infra, backend API, frontend widgets) at
  file-level granularity — don't do one giant commit.

## Current status / pending work (Fase 1)

- Core tool feature set is functionally complete and verified in-browser: board
  with ValueStats-style match rows + team-level market trends, Cheatsheets
  carousel (6 categories), Advanced Tools (Injuries/Opponent Rank, clean 3-or-6
  card grid), Parlays (game-switcher + multi-slate carousel), data-freshness
  system (dual-cadence scheduler + manual refresh + "Updated Xm ago").
- Backend smoke tests exist (`backend/tests/test_smoke.py`) but there is no
  frontend test suite yet, and no CI workflow running tests on push/PR.
- Not yet deployed to Railway — `railway.toml`/`infra/Dockerfile` exist but the
  actual `railway up`/deploy step has not been run this session.
- No user accounts/auth yet (expected — Fase 1 has no auth per roadmap above).
  Auth approach still to be decided — see "Auth ideas" below.
- Basic anonymous analytics now in place: `analytics_events` table +
  `POST /api/events` + `api.trackEvent(name, metadata?)` on the frontend, wired
  into page view, status filter change, refresh click, parlay game switch.
- Basic error monitoring now in place: a global FastAPI exception handler logs
  unhandled errors with traceback (`app/main.py`, `log_unhandled_exceptions`).
  No external service (Sentry etc.) wired yet — logs go to stdout only.
- `PREMIUM_CANDIDATE_FEATURES` list in `main.py` (currently `["advanced_tools",
  "parlays"]`) marks Fase-4 gating candidates conceptually — no enforcement.

## Auth ideas (not decided yet — discuss before implementing)

Building a full login system from scratch (password hashing, reset flows,
sessions) is a lot of surface area for Fase 1. Since the DB is already on
Supabase, the lowest-effort path is likely **Supabase Auth** (built into the
same project): email magic link / OTP and/or Google OAuth, with the Postgres
`auth.users` table already provided — no custom user table or password storage
needed. Alternatives if not using Supabase Auth: `fastapi-users` (more DIY,
more control) or a third-party like Clerk/Auth0 (fastest to ship, adds a paid
dependency). Do not implement any of this without explicit user go-ahead.
