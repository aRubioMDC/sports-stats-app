"""Repository layer for common DB queries used by the board and market trends.

This is intentionally small and focused: it centralizes the repeated game-window
queries used across the sports-aware board widgets while leaving richer business
logic in the routing/service layer.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import Game
from .sport_registry import get_sport


class GameRepository:
    """Thin data-access layer for sport-aware game queries."""

    DEFAULT_TEAM_POINT_THRESHOLDS = [27.5, 23.5, 20.5, 17.5]
    DEFAULT_GAME_TOTAL_THRESHOLDS = [50.5, 44.5, 40.5, 36.5]

    def __init__(self, db: Session | None = None, sport: str = "nfl"):
        self.db = db
        self.sport = sport

    def market_thresholds(self) -> dict[str, list[float]]:
        return get_sport(self.sport).market_thresholds()

    def team_market_thresholds(self) -> dict[str, list[float]]:
        return {"team_points": self.market_thresholds().get("team_points", self.DEFAULT_TEAM_POINT_THRESHOLDS)}

    def game_market_thresholds(self) -> dict[str, list[float]]:
        return {"game_total_points": self.market_thresholds().get("game_total_points", self.DEFAULT_GAME_TOTAL_THRESHOLDS)}

    def recent_final_games_for_team(self, team_id: int, limit: int = 5) -> list[Game]:
        if self.db is None:
            raise ValueError("A database session is required to fetch recent team games.")
        return (
            self.db.query(Game)
            .filter(
                Game.sport == self.sport,
                Game.status == "final",
                (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
            )
            .order_by(Game.season.desc(), Game.week.desc())
            .limit(limit)
            .all()
        )

    def recent_team_form(self, team_id: int, limit: int = 5) -> list[str]:
        form: list[str] = []
        for game in self.recent_final_games_for_team(team_id, limit=limit):
            if game.home_team_id == team_id:
                team_score, opp_score = game.home_score or 0, game.away_score or 0
            else:
                team_score, opp_score = game.away_score or 0, game.home_score or 0
            if team_score > opp_score:
                form.append("W")
            elif team_score < opp_score:
                form.append("L")
            else:
                form.append("T")
        return form

    def recent_team_scores(self, team_id: int, limit: int = 5) -> list[int]:
        games = self.recent_final_games_for_team(team_id, limit=limit)
        scores: list[int] = []
        for game in games:
            score = game.home_score if game.home_team_id == team_id else game.away_score
            if score is not None:
                scores.append(score)
        return scores

    def recent_game_total_scores(self, home_team_id: int, away_team_id: int, limit: int = 5) -> list[int]:
        if self.db is None:
            raise ValueError("A database session is required to fetch recent game totals.")
        combined_scores: list[int] = []
        for team_id in (home_team_id, away_team_id):
            recent = (
                self.db.query(Game)
                .filter(
                    Game.sport == self.sport,
                    Game.status == "final",
                    (Game.home_team_id == team_id) | (Game.away_team_id == team_id),
                )
                .order_by(Game.season.desc(), Game.week.desc())
                .limit(limit)
                .all()
            )
            for game in recent:
                if game.home_score is not None and game.away_score is not None:
                    combined_scores.append(game.home_score + game.away_score)
        return combined_scores
