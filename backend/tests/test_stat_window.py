from app.config import settings
from app.etl.stat_window import get_stat_window


def test_default_threshold_uses_the_global_small_sample_setting():
    limit = settings.small_sample_week_threshold

    assert get_stat_window(2026, limit, 2025).window_mode == "blended"
    assert get_stat_window(2026, limit + 1, 2025).window_mode == "current"


def test_explicit_threshold_overrides_the_global_setting():
    blended = get_stat_window(20262027, 12, 20252026, threshold=20)
    current = get_stat_window(20262027, 21, 20252026, threshold=20)

    assert blended.window_mode == "blended"
    assert blended.seasons_included == [20252026, 20262027]
    assert current.window_mode == "current"
    assert current.seasons_included == [20262027]


def test_nhl_threshold_is_larger_than_the_football_one():
    assert settings.small_sample_games_threshold_nhl > settings.small_sample_week_threshold
