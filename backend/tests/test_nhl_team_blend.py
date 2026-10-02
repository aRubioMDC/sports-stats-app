from app.etl import nhl_client
from app.etl.ingest_team_stats_nhl import _slot_values, _totals


def test_slot_values_are_per_game_rates_from_real_totals():
    totals = _totals({"gamesPlayed": 84, "goalFor": 252, "goalDifferential": 42, "wins": 42, "points": 105})

    values = _slot_values(totals)

    assert values["points_per_game"] == 0.625
    assert values["yards_per_game"] == 3.0
    assert values["time_of_possession_seconds_per_game"] == 0.5
    assert values["def_sacks_total"] == 0.5


def test_slot_values_are_zero_without_games():
    assert set(_slot_values(_totals({})).values()) == {0.0}


def test_final_standings_walks_back_to_the_last_regular_season_day(monkeypatch):
    calls: list[str] = []

    def fake_standings_on(day: str) -> list[dict]:
        calls.append(day)
        return [{"seasonId": 20252026}] if day <= "2026-04-17" else []

    monkeypatch.setattr(nhl_client, "get_standings_on", fake_standings_on)
    nhl_client.get_final_standings.cache_clear()

    assert nhl_client.get_final_standings(20252026) == [{"seasonId": 20252026}]
    assert calls[0] == "2026-04-30"
    assert calls[-1] == "2026-04-17"
    nhl_client.get_final_standings.cache_clear()
