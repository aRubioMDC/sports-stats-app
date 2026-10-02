"""Performance baseline tests for key user-facing endpoints.

Thresholds are intentionally conservative for remote DB environments. These
are regression sentinels, not micro-benchmarks.
"""

from time import perf_counter

import truststore
from fastapi.testclient import TestClient

from app.main import app

truststore.inject_into_ssl()


MAX_BOARD_SECONDS = 12.0
MAX_CHEATSHEET_SECONDS = 12.0
MAX_CACHE_JITTER_SECONDS = 0.020


def _timed_get(client: TestClient, path: str, params: dict | None = None):
    start = perf_counter()
    resp = client.get(path, params=params)
    elapsed = perf_counter() - start
    return resp, elapsed


def test_board_response_time_and_cache_baseline():
    client = TestClient(app)
    cfg = client.get("/api/nfl/config").json()
    params = {
        "season": cfg["current_season"],
        "week": cfg["recommended_period"],
    }

    first_resp, first_elapsed = _timed_get(client, "/api/nfl/board", params)
    second_resp, second_elapsed = _timed_get(client, "/api/nfl/board", params)

    assert first_resp.status_code == 200
    assert second_resp.status_code == 200
    assert first_elapsed < MAX_BOARD_SECONDS
    # Cached request should not be meaningfully slower than cold request.
    # For very small local timings, compare with a small absolute jitter margin.
    assert second_elapsed <= max((first_elapsed * 1.5), (first_elapsed + MAX_CACHE_JITTER_SECONDS))


def test_cheatsheet_response_time_baseline():
    client = TestClient(app)
    params = {"min_hit_rate": 1.0, "min_games": 3}

    resp, elapsed = _timed_get(client, "/api/nfl/trends/cheatsheet", params)

    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert elapsed < MAX_CHEATSHEET_SECONDS
