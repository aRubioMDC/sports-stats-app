from pydantic import BaseModel


class TeamOut(BaseModel):
    id: int
    abbreviation: str
    name: str
    primary_color: str
    logo_url: str

    class Config:
        from_attributes = True


class GameOut(BaseModel):
    id: int
    season: int
    week: int
    kickoff: str | None
    home_team: TeamOut
    away_team: TeamOut
    home_score: int | None
    away_score: int | None
    status: str

    class Config:
        from_attributes = True


class StatRow(BaseModel):
    """One row of the matchup comparison card."""

    label: str
    home_value: float
    home_rank: int
    away_value: float
    away_rank: int
    leader: str  # "home" | "away" | "tie"


class HeadToHeadResult(BaseModel):
    season: int
    week: int
    home_team: str
    away_team: str
    home_score: int
    away_score: int


class MatchupContextOut(BaseModel):
    game: GameOut
    window_mode: str
    stat_rows: list[StatRow]
    head_to_head: list[HeadToHeadResult]


class TrendSignalOut(BaseModel):
    label: str
    hits: int
    games: int
    hit_rate: float


class PlayerTrendOut(BaseModel):
    player_id: int
    player_name: str
    team: str
    stat_name: str
    threshold: float
    direction: str
    window_mode: str
    signals: list[TrendSignalOut]


class CheatsheetRowOut(BaseModel):
    player_name: str
    team: str
    stat_name: str
    threshold: float
    direction: str
    hits: int
    games: int
    hit_rate: float
    hit_rate_ci_low: float | None = None  # Wilson score lower bound — how bad it could really be
    hit_rate_ci_high: float | None = None  # Wilson score upper bound
    market_line: float | None = None  # real sportsbook line matched to this signal, if available
    market_opening_line: float | None = None  # earliest recorded line from the same bookmaker
    market_price: float | None = None  # American odds price for our side (over/under) at that line
    market_implied_prob: float | None = None  # de-vigged fair probability implied by market_price
    market_hits: int | None = None  # our hit count recomputed against the REAL market line (not our own threshold)
    market_games: int | None = None  # games count for the same recomputation
    edge: float | None = None  # market_hits/market_games minus market_implied_prob; only set with a real match
    kelly_fraction: float | None = None  # suggested fraction of bankroll (quarter-Kelly), 0 when there's no edge
    without_player: str | None = None  # set only for the injury-impact category
    without_player_hits: int | None = None  # this player's hits specifically in games teammate missed
    without_player_games: int | None = None  # games count for the same window
    opponent_rank: int | None = None  # set only for the opponent-rank category (1 = best defense)
    opponent_team_count: int | None = None  # total teams, so the frontend can render "Nth of M"
    opponent_team: str | None = None  # upcoming opponent abbreviation, e.g. "ATL is a good matchup"
    
    # Contextual signal data (Linemate-style badges)
    split_hits: int | None = None  # Home/away split hits (if available from home_away_splits category)
    split_games: int | None = None  # Home/away split games count
    h2h_hits: int | None = None  # Head-to-head vs opponent hits (if available from versus_opponent category)
    h2h_games: int | None = None  # Head-to-head games count
    
    # Game information for sorting by upcoming games
    game_id: int | None = None  # Next game ID for this player's team
    game_kickoff: str | None = None  # Next game kickoff time (ISO format)
    is_home: bool | None = None  # True if next game is at home


class TeamGeneralStats(BaseModel):
    """Season averages shown in the ValueStats-style match row ("general stats" column)."""

    points_per_game: float
    points_per_game_rank: int
    yards_per_game: float
    yards_per_game_rank: int


class ParlayOut(BaseModel):
    """One parlay slate for a game \u2014 a handful of legs plus their weakest-leg summary."""

    legs: list[CheatsheetRowOut]
    summary_hits: int
    summary_games: int


class BoardGameOut(BaseModel):
    """One landing-page match row: kickoff/status, team form, general stats, top trends."""

    game: GameOut
    home_form: list[str]  # "W"/"L"/"T", most recent first
    away_form: list[str]
    home_stats: TeamGeneralStats | None
    away_stats: TeamGeneralStats | None
    top_trends: list[CheatsheetRowOut]


class TrendGroupsOut(BaseModel):
    """Linemate-style cheatsheet categories, all backed by real computed hit-rate data."""

    recent_form: list[CheatsheetRowOut]
    versus_opponent: list[CheatsheetRowOut]
    alternate_lines: list[CheatsheetRowOut]
    home_away_splits: list[CheatsheetRowOut]
    unders_only: list[CheatsheetRowOut]
    team_form: list[CheatsheetRowOut]
    injury_impact: list[CheatsheetRowOut]
    opponent_rank: list[CheatsheetRowOut]


class OddsLineOut(BaseModel):
    bookmaker: str
    market: str
    outcome_name: str
    price: float
    point: float | None


class PlayerPropOddsOut(BaseModel):
    player_name: str
    market: str
    bookmaker: str
    line: float
    over_price: float | None
    under_price: float | None
