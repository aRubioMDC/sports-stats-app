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
