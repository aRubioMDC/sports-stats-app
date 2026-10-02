# HitRate

HitRate is a multi-sport stats and betting-decision app that blends ValueStats-style
matchup context with Linemate-style player trend signals. It started as an NFL tool,
expanded into NHL support, and is designed for additional sports and leagues behind the
same SportAdapter interface.

## Current status

This project is currently in a stable alpha / product-validation phase:

- Core user flows are working for NFL and NHL
- The backend architecture is substantially refactored around sport adapters,
  repositories, and service/query boundaries
- The app is functional locally and in the browser, but it is not yet a finished
  production product

## Documentation map

This repository now uses a compact documentation set:

- `README.md` (this file): project overview, setup, architecture, and quick operations
- `PRODUCT.md`: product goals, users, UX direction, and roadmap constraints
- `DESIGN.md`: visual system, color rules, typography, and component behavior
- `DEPLOYMENT_GUIDE.md`: self-host deployment runbook (Docker + Cloudflare Tunnel)

Historical one-off analysis/session reports were removed to avoid duplicate or stale docs.

## Roadmap snapshot

- Fase 1: completed — NFL core tool, free, stable, no auth
- Fase 2: live — multi-sport expansion with NHL support via the SportAdapter pattern
- Fase 3: refinement and cleanup of the app architecture and product polish
- Fase 4: future gating and premium-candidate evaluation after real traction is proven

Live score delivery path:

- Now: short-interval polling + internal SSE push for start/score/final updates
- Future: dedicated external live-feed subscription with provider push events (webhook/socket)

## Stack
- Backend: Python 3.12, FastAPI, SQLAlchemy 2.0, Alembic, APScheduler
- Frontend: React 19, Vite, TypeScript, Tailwind CSS v4
- Data layer: Postgres via Supabase Session Pooler, with ETL powered by nflverse / sports adapters
- Multi-sport architecture: SportAdapter protocol + SPORTS registry for NFL and NHL

## High-level architecture

- Backend: modular monolith with thin routers and shared service/repository/query layers
- Multi-sport model: `SportAdapter` + `SPORTS` registry (`nfl`, `nhl`)
- Frontend: React pages backed by typed API hooks and sport-aware period navigation
- Data refresh: scheduler jobs for lightweight score refresh + periodic full ETL
- Caching: TTL caching on expensive board/trends endpoints, cache invalidated after refresh/ETL

## Local development

### Backend
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --port 8000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev
```

The Vite dev server runs on port 5173 by default and proxies the API calls to the
backend service.

In this repo the Vite config pins local dev to port `5174` and proxies `/api` to
backend port `8001`.

## Test and validation

Backend smoke tests:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest tests\test_smoke.py -q
```

Frontend build/type check:

```powershell
cd frontend
npm run build
```

Frontend unit/component tests:

```powershell
cd frontend
npm test
```

Frontend e2e smoke tests (Playwright):

```powershell
cd frontend
npm run test:e2e
```

## Business rule: small-sample blending
If a team or player has played fewer than or equal to the configured threshold games in
the current season, the app blends current-season and previous-season data to smooth the
sample. This behavior lives in the ETL/stat-window logic and is intentionally kept
sport-aware rather than hardcoded to one league.

## Deployment status
The project has container and deployment artifacts in place, but there is no fully
validated production deployment on a real public server yet. Local runs are the current
verification baseline.

Runtime deploy safety has been strengthened with `infra/scripts/post-deploy-smoke.sh`,
which is now executed automatically by both deploy and rollback scripts.
Release rehearsal evidence can be summarized with
`infra/scripts/rehearsal-report.sh`.
A one-shot release validation command is available at
`infra/scripts/release-closeout.sh`.

## Next steps and known gaps
The project is functionally working and the refactor is in good shape, but the following
items remain open before calling the project closed or production-ready:

- No real auth is implemented yet
- No validated final deployment on a real server has been completed
- Full production-release evidence on the target host (real deploy rehearsal + rollback proof + captured smoke logs) is not yet complete
- The Fase 4 roadmap is not closed yet, including premium-candidate decisions and gating logic
- The full refactor across all routes and layers is not considered finally complete
- Several areas remain in active evolution rather than a single consolidated final version
- The app still needs real UX and production-operations validation beyond backend correctness

These items intentionally remain documented as roadmap follow-up rather than as hidden
workarounds or pass-through shortcuts.
