"""Production-facing API contract checks that guard key UI assumptions.

These tests use the same real dev/staging DB as smoke tests and validate
payload shape/consistency for board and matchup endpoints.
"""

import truststore

truststore.inject_into_ssl()

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _config_for(sport: str) -> dict:
    resp = client.get(f"/api/{sport}/config")
    assert resp.status_code == 200
    return resp.json()


def _board_for(sport: str) -> list[dict]:
    cfg = _config_for(sport)
    resp = client.get(
        f"/api/{sport}/board",
        params={"season": cfg["current_season"], "week": cfg["recommended_period"]},
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert isinstance(rows, list)
    return rows


def test_health_contract_includes_db_status():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"


def test_nhl_board_exposes_team_snapshot_stats_shape():
    rows = _board_for("nhl")
    if not rows:
        pytest.skip("No NHL games available for current recommended period")

    row = next((r for r in rows if r.get("home_stats") or r.get("away_stats")), None)
    assert row is not None, "Expected at least one board row with team snapshot stats"

    for side_key in ("home_stats", "away_stats"):
        stats = row.get(side_key)
        if stats is None:
            continue
        assert "points_per_game" in stats
        assert "points_per_game_rank" in stats
        assert "yards_per_game" in stats
        assert "yards_per_game_rank" in stats


def test_matchup_stat_rows_present_when_board_stats_exist():
    rows = _board_for("nhl")
    if not rows:
        pytest.skip("No NHL games available for current recommended period")

    candidate = next(
        (
            r
            for r in rows
            if r.get("home_stats") is not None and r.get("away_stats") is not None
        ),
        None,
    )
    if candidate is None:
        pytest.skip("No matchup found with both home/away stats available")

    game_id = candidate["game"]["id"]
    resp = client.get(f"/api/nhl/games/{game_id}/matchup")
    assert resp.status_code == 200
    body = resp.json()

    assert isinstance(body.get("stat_rows"), list)
    assert len(body["stat_rows"]) > 0
