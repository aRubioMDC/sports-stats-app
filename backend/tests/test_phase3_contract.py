from app.core.repositories import GameRepository
from app.core.sport_registry import SPORTS


def test_market_thresholds_are_exposed_per_sport():
    for sport in SPORTS.values():
        thresholds = sport.market_thresholds()
        assert isinstance(thresholds, dict)
        assert "team_points" in thresholds
        assert "game_total_points" in thresholds
        assert thresholds["team_points"]
        assert thresholds["game_total_points"]


def test_game_repository_uses_sport_specific_threshold_defaults():
    repo = GameRepository(sport="nfl")
    assert repo.team_market_thresholds()["team_points"]
    assert repo.game_market_thresholds()["game_total_points"]
