"""Smoke tests hitting the real (dev/staging) DB read-only endpoints.

Not a substitute for proper unit tests with fixtures — just a fast guard against
silent regressions in the core API surface (config, board, cheatsheets, parlays).
"""
import truststore

truststore.inject_into_ssl()

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["db"] == "ok"


def test_list_sports():
    resp = client.get("/api/sports")
    assert resp.status_code == 200
    slugs = [s["slug"] for s in resp.json()]
    assert "nfl" in slugs


def test_sport_config():
    resp = client.get("/api/nfl/config")
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["current_season"], int)
    assert isinstance(body["current_week"], int)


def test_unknown_sport_404():
    resp = client.get("/api/doesnotexist/config")
    assert resp.status_code == 404


def test_board_returns_list():
    config = client.get("/api/nfl/config").json()
    resp = client.get(
        "/api/nfl/board",
        params={"season": config["current_season"], "week": config["current_week"]},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_nhl_board_has_snapshot_stats_when_games_exist():
    config = client.get("/api/nhl/config").json()
    resp = client.get(
        "/api/nhl/board",
        params={"season": config["current_season"], "week": config["recommended_period"]},
    )
    assert resp.status_code == 200
    rows = resp.json()
    if rows:
        assert any((row.get("home_stats") is not None) or (row.get("away_stats") is not None) for row in rows)


def test_trend_groups_shape():
    resp = client.get("/api/nfl/trends/groups")
    assert resp.status_code == 200
    body = resp.json()
    for key in (
        "recent_form",
        "versus_opponent",
        "alternate_lines",
        "home_away_splits",
        "unders_only",
        "team_form",
        "injury_impact",
        "opponent_rank",
    ):
        assert key in body
        assert isinstance(body[key], list)


def test_cheatsheet_returns_list():
    resp = client.get("/api/nfl/trends/cheatsheet", params={"min_hit_rate": 1.0, "min_games": 3})
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
