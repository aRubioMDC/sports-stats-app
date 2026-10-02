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


def test_nfl_prediction_contract_is_coherent():
    rows = _board_for("nfl")
    if not rows:
        pytest.skip("No NFL games available for current recommended period")

    game_id = rows[0]["game"]["id"]
    resp = client.get(f"/api/nfl/games/{game_id}/prediction")
    assert resp.status_code == 200
    body = resp.json()
    if not body["available"]:
        assert body["reason"]
        return

    win = body["win"]
    assert win["home"] + win["away"] == pytest.approx(1.0, abs=0.01)
    assert body["projected_total"] == pytest.approx(body["projected_home"] + body["projected_away"], abs=0.2)
    assert len(body["totals"]) >= 3
    for line in body["totals"] + body["home_team_totals"] + body["away_team_totals"]:
        assert line["over"] + line["under"] == pytest.approx(1.0, abs=0.01)
        assert 0 < line["over"] < 1
    assert [b["label"] for b in body["margin_buckets"]] == ["1-3", "4-7", "8-14", "15+"]


def test_prediction_unknown_game_returns_404():
    assert client.get("/api/nfl/games/999999999/prediction").status_code == 404


def test_prediction_unavailable_for_unmodelled_sport():
    rows = _board_for("nhl")
    if not rows:
        pytest.skip("No NHL games available for current recommended period")

    resp = client.get(f"/api/nhl/games/{rows[0]['game']['id']}/prediction")
    assert resp.status_code == 200
    assert resp.json()["available"] is False
