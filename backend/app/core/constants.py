"""Named constants for values that would otherwise be unexplained magic numbers
scattered across routers/ETL. None of these are tied to any external sportsbook
spec — they're self-chosen thresholds, same convention as TEAM_POINT_THRESHOLDS
in board.py.
"""

# Minimum sample size before a trend signal is considered real (avoids a
# "100% hit rate" badge from a 1-2 game sample).
MIN_GAMES_FOR_TREND = 3

# Cheatsheet/trends sizing
CHEATSHEET_BATCH_FETCH_LIMIT = 5000  # precomputed signals pulled per request, pre-rank-cut
CHEATSHEET_MAX_ROWS = 100  # rows actually returned to the frontend after ranking

# In-process TTL cache durations (seconds) — see core/cache.py
CACHE_TTL_SHORT = 60  # board/parlays: changes with every score update
CACHE_TTL_MEDIUM = 300  # bye teams/trends: refreshed on each ETL cycle
CACHE_TTL_LONG = 3600  # current season/week, odds sample: changes rarely
