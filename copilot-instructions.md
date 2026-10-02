# Copilot Chat Customization - NFL Stats App

## Instructions for GitHub Copilot

You are an expert AI assistant helping develop an NFL betting statistics platform. This workspace contains both backend (FastAPI + PostgreSQL) and frontend (React 21 + TypeScript) applications.

### Core Objectives
1. Implement Linemate.io-style cheatsheet categories with 100% hit rate signals
2. Maintain data flow: Database → Backend Queries → Frontend React Components
3. Use web search to analyze competitors and validate implementation
4. Persist architectural decisions and context across sessions

### Frontend Architecture
- **Location**: `frontend/src/`
- **Stack**: React 21, TypeScript, Vite, React Router, TanStack React Query
- **Key Components**: 
  - `pages/Home.tsx` - Main dashboard with 4 widget sections
  - `api.ts` - Centralized API integration with React Query hooks
  - Widget components: CheatsheetGroups, AdvancedToolsWidget, ParlaysWidget

### Backend Architecture  
- **Location**: `backend/app/`
- **Stack**: Python FastAPI, SQLAlchemy ORM, PostgreSQL, APScheduler
- **Key Files**:
  - `routers/trends.py` - `/trends/cheatsheet` and `/trends/groups` endpoints
  - `routers/board.py` - Game data and parlay recommendations
  - `models.py` - Database schema (PlayerTrendSignal, PlayerWeeklyStat, etc.)
  - `schemas.py` - Pydantic models for API responses

### Current Work State
- **Phase**: Feature Implementation - Categorizing trend signals into 8 cheatsheet types
- **Backend Status**: ✅ Routes ready, ⏳ Data population in progress
- **Frontend Status**: ✅ Components ready, ⏳ Connecting to live backend data
- **Data Source**: PlayerTrendSignal table with precomputed hit rates

### Implementation Pattern
When implementing features:
1. Start with backend data layer (queries, transformations)
2. Ensure API schemas include all necessary fields
3. Connect frontend React Query hooks to backend endpoints
4. Add component rendering logic last
5. Use web search for competitor analysis if building similar features

### Mandatory standards for this repo
- Never create opaque or random file names such as `a1b2c3d4e5f6_*`.
- Names must describe the responsibility clearly and fit the repo conventions.
- Prefer updating existing files over creating a new one when the feature belongs to an existing module.
- Refactors must follow SOLID and keep the route layer thin; move logic to services, repositories, or helpers.
- Do not mix unrelated responsibilities in one file or one patch.
- Keep all multi-sport logic behind adapter/registry patterns and never hardcode sport assumptions.
- Add targeted validation after refactors and before claiming the work is complete.
- Document remaining gaps honestly instead of labeling the project as fully complete when it is not.

### Use Web Search When:
- Analyzing Linemate.io or other betting apps for feature parity
- Looking up NFL API documentation
- Researching performance optimization for large datasets
- Finding React/TypeScript patterns for similar applications

### Common Commands
```bash
# Backend
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm run dev

# Test Backend
curl "http://localhost:8000/api/nfl/trends/groups?season=2026&week=3"
curl "http://localhost:8000/api/nfl/board?season=2026&week=3"
```

### Critical Context
- Games Grid: ✅ Working with 16 games + form indicators
- Trending Today: ✅ Working with top 3 picks from cheatsheet
- CheatsheetGroups: 🔄 Structure ready, needs data population
- AdvancedToolsWidget: 🔄 Needs injury impact queries
- ParlaysWidget: 🔄 Needs parlay expansion logic

### Git Workflow
- Always ask user before `git commit`
- Show `git status`/diff summary first
- User preference: Explicit confirmation needed

### Legal & Compliance
- **Privacy Policy, Terms, Disclaimer**: Implemented in `frontend/src/pages/` with routes
- **Footer Component**: Created with links to legal pages and resources
- **Cookie/Auth roadmap**: Summarized in `PRODUCT.md` under "Auth and Privacy Roadmap"
  - Current state: No auth/session cookies in production flows
  - Fase 3-4 target: secure auth sessions + explicit analytics consent
  - Legal docs should be updated as tracking/auth scope evolves

---

**Web Search Integration**: Enabled via `vscode-websearchforcopilot_webSearch`  
**Memory System**: Session-scoped context maintained across conversation turns  
**Last Updated**: 2026-10-01
