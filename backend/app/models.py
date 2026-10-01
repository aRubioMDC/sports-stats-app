from datetime import datetime

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("sport", "abbreviation"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(String(16), default="nfl", index=True)
    abbreviation: Mapped[str] = mapped_column(String(8), index=True)
    name: Mapped[str] = mapped_column(String(64))
    conference: Mapped[str] = mapped_column(String(8))
    division: Mapped[str] = mapped_column(String(16))
    primary_color: Mapped[str] = mapped_column(String(16), default="#000000")
    logo_url: Mapped[str] = mapped_column(String(256), default="")


class Game(Base):
    __tablename__ = "games"
    __table_args__ = (UniqueConstraint("sport", "season", "week", "home_team_id", "away_team_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(String(16), default="nfl", index=True)
    nflverse_game_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    season: Mapped[int] = mapped_column(Integer, index=True)
    week: Mapped[int] = mapped_column(Integer, index=True)
    game_type: Mapped[str] = mapped_column(String(8), default="REG")  # REG, POST
    kickoff: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    home_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    away_team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"))
    home_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    away_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(16), default="scheduled")  # scheduled, final

    home_team: Mapped["Team"] = relationship(foreign_keys=[home_team_id])
    away_team: Mapped["Team"] = relationship(foreign_keys=[away_team_id])


class TeamSeasonStats(Base):
    """Precomputed per-team aggregates for a given season, refreshed by the ETL.

    `window_mode` records which rule produced the row ("blended" = current+previous
    season pooled because weeks_played <= threshold, "current" = current season only),
    per the small-sample blending rule.
    """

    __tablename__ = "team_season_stats"
    __table_args__ = (UniqueConstraint("team_id", "season"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(String(16), default="nfl", index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id"), index=True)
    season: Mapped[int] = mapped_column(Integer, index=True)
    weeks_played: Mapped[int] = mapped_column(Integer, default=0)
    window_mode: Mapped[str] = mapped_column(String(16), default="current")

    points_per_game: Mapped[float] = mapped_column(Float, default=0)
    yards_per_game: Mapped[float] = mapped_column(Float, default=0)
    time_of_possession_seconds_per_game: Mapped[float] = mapped_column(Float, default=0)
    def_sacks_total: Mapped[float] = mapped_column(Float, default=0)
    def_interceptions_total: Mapped[float] = mapped_column(Float, default=0)
    turnover_differential_total: Mapped[float] = mapped_column(Float, default=0)

    points_per_game_rank: Mapped[int] = mapped_column(Integer, default=0)
    yards_per_game_rank: Mapped[int] = mapped_column(Integer, default=0)
    time_of_possession_rank: Mapped[int] = mapped_column(Integer, default=0)
    def_sacks_rank: Mapped[int] = mapped_column(Integer, default=0)
    def_interceptions_rank: Mapped[int] = mapped_column(Integer, default=0)
    turnover_differential_rank: Mapped[int] = mapped_column(Integer, default=0)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    team: Mapped["Team"] = relationship()


class Player(Base):
    __tablename__ = "players"

    id: Mapped[int] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(String(16), default="nfl", index=True)
    gsis_id: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(128))
    position: Mapped[str] = mapped_column(String(8))
    team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    headshot_url: Mapped[str] = mapped_column(String(256), default="")

    team: Mapped["Team | None"] = relationship()


class PlayerWeeklyStat(Base):
    """Raw per-game stat line, source of truth for rolling hit-rate calculations."""

    __tablename__ = "player_weekly_stats"
    __table_args__ = (UniqueConstraint("player_id", "season", "week"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id"), nullable=True)
    season: Mapped[int] = mapped_column(Integer, index=True)
    week: Mapped[int] = mapped_column(Integer, index=True)
    opponent_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    is_home: Mapped[bool] = mapped_column(Boolean, default=False)

    receptions: Mapped[float] = mapped_column(Float, default=0)
    receiving_yards: Mapped[float] = mapped_column(Float, default=0)
    rushing_yards: Mapped[float] = mapped_column(Float, default=0)
    passing_yards: Mapped[float] = mapped_column(Float, default=0)
    passing_tds: Mapped[float] = mapped_column(Float, default=0)
    rushing_tds: Mapped[float] = mapped_column(Float, default=0)
    receiving_tds: Mapped[float] = mapped_column(Float, default=0)

    player: Mapped["Player"] = relationship()


class PlayerTrendSignal(Base):
    """Precomputed hit-rate signal for a (player, stat, threshold) combo, refreshed by ETL."""

    __tablename__ = "player_trend_signals"

    id: Mapped[int] = mapped_column(primary_key=True)
    sport: Mapped[str] = mapped_column(String(16), default="nfl", index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    stat_name: Mapped[str] = mapped_column(String(32), index=True)  # e.g. receiving_yards
    threshold: Mapped[float] = mapped_column(Float)
    direction: Mapped[str] = mapped_column(String(8), default="over")  # over/under
    window_mode: Mapped[str] = mapped_column(String(16), default="current")

    recent_form_hits: Mapped[int] = mapped_column(Integer, default=0)
    recent_form_games: Mapped[int] = mapped_column(Integer, default=0)
    h2h_hits: Mapped[int] = mapped_column(Integer, default=0)
    h2h_games: Mapped[int] = mapped_column(Integer, default=0)
    split_hits: Mapped[int] = mapped_column(Integer, default=0)
    split_games: Mapped[int] = mapped_column(Integer, default=0)
    opponent_rank: Mapped[int] = mapped_column(Integer, default=0)

    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    player: Mapped["Player"] = relationship()


class OddsEvent(Base):
    __tablename__ = "odds_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), unique=True)
    external_event_id: Mapped[str] = mapped_column(String(64), unique=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class OddsLine(Base):
    """Moneyline / spread / total for a game, one row per bookmaker per market."""

    __tablename__ = "odds_lines"

    id: Mapped[int] = mapped_column(primary_key=True)
    odds_event_id: Mapped[int] = mapped_column(ForeignKey("odds_events.id"), index=True)
    bookmaker: Mapped[str] = mapped_column(String(32))
    market: Mapped[str] = mapped_column(String(16))  # h2h, spreads, totals
    outcome_name: Mapped[str] = mapped_column(String(32))
    price: Mapped[float] = mapped_column(Float)
    point: Mapped[float | None] = mapped_column(Float, nullable=True)


class PlayerPropOdds(Base):
    """Player prop line snapshot from the odds provider, if available on the plan."""

    __tablename__ = "player_prop_odds"

    id: Mapped[int] = mapped_column(primary_key=True)
    odds_event_id: Mapped[int] = mapped_column(ForeignKey("odds_events.id"), index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    market: Mapped[str] = mapped_column(String(32))  # player_receptions, player_pass_yds, ...
    bookmaker: Mapped[str] = mapped_column(String(32))
    line: Mapped[float] = mapped_column(Float)
    over_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    under_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class AnalyticsEvent(Base):
    """Anonymous usage event (no user accounts yet) — feeds Fase 4 traction decisions."""

    __tablename__ = "analytics_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_name: Mapped[str] = mapped_column(String(64), index=True)
    sport: Mapped[str | None] = mapped_column(String(16), nullable=True)
    metadata_json: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)


class HockeyPlayerGameStat(Base):
    """Real per-game skater box score line from the NHL API — kept as its own table
    since none of these stat columns overlap with PlayerWeeklyStat's football stats."""

    __tablename__ = "hockey_player_game_stats"
    __table_args__ = (UniqueConstraint("player_id", "nhl_game_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("players.id"), index=True)
    game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id"), nullable=True)
    nhl_game_id: Mapped[int] = mapped_column(Integer, index=True)  # real NHL API game id, for de-dup
    season: Mapped[int] = mapped_column(Integer, index=True)
    game_date: Mapped[str] = mapped_column(String(16))  # ISO date (YYYY-MM-DD) — real chronological order
    opponent_team_id: Mapped[int | None] = mapped_column(ForeignKey("teams.id"), nullable=True)
    is_home: Mapped[bool] = mapped_column(Boolean, default=False)

    goals: Mapped[float] = mapped_column(Float, default=0)
    assists: Mapped[float] = mapped_column(Float, default=0)
    points: Mapped[float] = mapped_column(Float, default=0)
    shots_on_goal: Mapped[float] = mapped_column(Float, default=0)

    player: Mapped["Player"] = relationship()

