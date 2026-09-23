from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.deps import valid_sport
from app.db import get_db
from app.models import Team
from app.schemas import TeamOut

router = APIRouter(prefix="/{sport}/teams", tags=["teams"])


@router.get("", response_model=list[TeamOut])
def list_teams(sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    """List all teams for the given sport."""
    teams = db.query(Team).filter(Team.sport == sport).order_by(Team.abbreviation).all()
    return teams
