from pydantic import BaseModel, ConfigDict


class TeamOut(BaseModel):
    id: int
    abbreviation: str
    name: str
    primary_color: str
    logo_url: str

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


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
    kickoff: str | None = None  # real ISO datetime — lets day-based sports show an actual date, not "Wk N"
    home_team: str
    away_team: str
    home_score: int
    away_score: int


class OddsSideOut(BaseModel):
    """One side of a real two-way market — best (most favorable) price across
    the books we track, plus the de-vigged consensus probability across them."""

    best_price: float
    best_bookmaker: str
    fair_prob: float | None = None


class MoneylineMarketOut(BaseModel):
    home: OddsSideOut | None = None
    away: OddsSideOut | None = None


class SpreadMarketOut(BaseModel):
    point: float | None = None  # consensus home spread point, e.g. -3.5
    home: OddsSideOut | None = None
    away: OddsSideOut | None = None


class TotalMarketOut(BaseModel):
    point: float | None = None
    over: OddsSideOut | None = None
    under: OddsSideOut | None = None


class StandingsRowOut(BaseModel):
    team: str
    logo_url: str
    primary_color: str
    wins: int
    losses: int
    ties: int
    pct: float
    is_in_game: bool  # highlights the two teams playing in this game


class RecentGameOut(BaseModel):
    season: int
    week: int
    kickoff: str | None = None  # real ISO datetime — lets day-based sports show an actual date, not "Wk N"
    opponent: str
    opponent_logo_url: str
    is_home: bool
    result: str  # W | L | T
    team_score: int
    opponent_score: int


class MatchupContextOut(BaseModel):
    game: GameOut
    window_mode: str
    stat_rows: list[StatRow]
    head_to_head: list[HeadToHeadResult]
    moneyline: MoneylineMarketOut | None = None
    spread: SpreadMarketOut | None = None
    total: TotalMarketOut | None = None
    division: str | None = None  # real Team.division, e.g. "AFC North"
    standings: list[StandingsRowOut] = []
    home_recent_games: list[RecentGameOut] = []
    away_recent_games: list[RecentGameOut] = []


class WinProbabilityOut(BaseModel):
    home: float  # normalized over decided games (ties are refunded in the moneyline)
    away: float


class MarginBucketOut(BaseModel):
    label: str  # e.g. "4-7" or "15+" points
    home: float  # P(home wins by this margin)
    away: float


class OverUnderLineOut(BaseModel):
    line: float
    over: float
    under: float


class SpreadLineOut(BaseModel):
    home_line: float  # home spread, e.g. -3.5
    home_cover: float
    away_cover: float


class MarketReferenceOut(BaseModel):
    """De-vigged sportsbook prices for comparison only; None when no real line exists."""

    home_win: float | None = None
    away_win: float | None = None
    total_point: float | None = None
    total_over: float | None = None
    spread_point: float | None = None


class GamePredictionOut(BaseModel):
    available: bool
    reason: str | None = None
    model: str | None = None
    projected_home: float | None = None
    projected_away: float | None = None
    projected_total: float | None = None
    league_games: float = 0
    home_games: float = 0  # weighted real games behind each team's rating
    away_games: float = 0
    low_sample: bool = False
    win: WinProbabilityOut | None = None
    margin_buckets: list[MarginBucketOut] = []
    totals: list[OverUnderLineOut] = []
    home_team_totals: list[OverUnderLineOut] = []
    away_team_totals: list[OverUnderLineOut] = []
    spreads: list[SpreadLineOut] = []
    market: MarketReferenceOut | None = None


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


class PlayerInfoOut(BaseModel):
    """Minimal real player identity for a player detail page header."""

    id: int
    full_name: str
    position: str
    team: str | None
    headshot_url: str | None


class CheatsheetRowOut(BaseModel):
    player_id: int | None = None  # None for team-level rows (moneyline/team totals), real player id otherwise
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
