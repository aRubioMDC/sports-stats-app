from app.routers.trends_service import build_trend_groups
from app.schemas import CheatsheetRowOut


def _row(
    *,
    player_name: str,
    hit_rate: float,
    games: int,
    stat_name: str = "receiving_yards",
    threshold: float = 75.0,
    direction: str = "over",
    h2h_hits: int | None = None,
    h2h_games: int | None = None,
    split_hits: int | None = None,
    split_games: int | None = None,
    opponent_rank: int | None = None,
    opponent_team_count: int | None = None,
    without_player_hits: int | None = None,
    without_player_games: int | None = None,
):
    return CheatsheetRowOut(
        player_id=1,
        player_name=player_name,
        team="BUF",
        stat_name=stat_name,
        threshold=threshold,
        direction=direction,
        hits=int(hit_rate * games),
        games=games,
        hit_rate=hit_rate,
        h2h_hits=h2h_hits,
        h2h_games=h2h_games,
        split_hits=split_hits,
        split_games=split_games,
        opponent_rank=opponent_rank,
        opponent_team_count=opponent_team_count,
        without_player_hits=without_player_hits,
        without_player_games=without_player_games,
    )


def test_build_trend_groups_returns_empty_buckets_when_no_rows():
    groups = build_trend_groups([])

    assert groups.recent_form == []
    assert groups.versus_opponent == []
    assert groups.home_away_splits == []
    assert groups.injury_impact == []
    assert groups.opponent_rank == []
    assert groups.alternate_lines == []
    assert groups.unders_only == []
    assert groups.team_form == []


def test_build_trend_groups_prioritizes_strongest_signal_types():
    rows = [
        _row(player_name="A", hit_rate=0.9, games=10),
        _row(player_name="B", hit_rate=0.8, games=8, h2h_hits=4, h2h_games=6),
        _row(player_name="C", hit_rate=0.7, games=6, split_hits=4, split_games=5),
        _row(player_name="D", hit_rate=0.65, games=5, direction="under", opponent_rank=5, opponent_team_count=32),
        _row(player_name="E", hit_rate=0.62, games=4, without_player_hits=3, without_player_games=4),
    ]

    groups = build_trend_groups(rows)

    assert [row.player_name for row in groups.recent_form] == ["A", "B"]
    assert [row.player_name for row in groups.versus_opponent] == ["B"]
    assert [row.player_name for row in groups.home_away_splits] == ["C"]
    assert [row.player_name for row in groups.opponent_rank] == ["D"]
    assert [row.player_name for row in groups.injury_impact] == ["E"]
