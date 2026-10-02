"""Basic concurrency checks for production-critical API endpoints.

These are lightweight guardrails to catch regressions that surface only when
multiple requests hit the API at the same time.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed

import truststore
from fastapi.testclient import TestClient

from app.main import app

truststore.inject_into_ssl()


def _request(path: str, params: dict | None = None) -> tuple[int, dict | list]:
    client = TestClient(app)
    resp = client.get(path, params=params)
    try:
        payload = resp.json()
    except Exception:
        payload = {}
    return resp.status_code, payload


def test_health_endpoint_handles_concurrent_requests():
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(_request, "/api/health") for _ in range(20)]
        results = [f.result() for f in as_completed(futures)]

    assert len(results) == 20
    assert all(status == 200 for status, _ in results)
    assert all(payload.get("status") == "ok" for _, payload in results)


def test_board_endpoint_handles_concurrent_requests():
    cfg_status, cfg_payload = _request("/api/nfl/config")
    assert cfg_status == 200

    params = {
        "season": cfg_payload["current_season"],
        "week": cfg_payload["recommended_period"],
    }

    with ThreadPoolExecutor(max_workers=6) as pool:
        futures = [pool.submit(_request, "/api/nfl/board", params) for _ in range(12)]
        results = [f.result() for f in as_completed(futures)]

    assert len(results) == 12
    assert all(status == 200 for status, _ in results)
    assert all(isinstance(payload, list) for _, payload in results)
