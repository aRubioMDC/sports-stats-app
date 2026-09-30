from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..core.deps import valid_sport
from ..db import get_db
from ..models import Team
from ..schemas import TeamOut

router = APIRouter(prefix="/{sport}/teams", tags=["teams"])


@router.get("", response_model=list[TeamOut])
def list_teams(sport: str = Depends(valid_sport), db: Session = Depends(get_db)):
    """List all teams for the given sport."""
    teams = db.query(Team).filter(Team.sport == sport).order_by(Team.abbreviation).all()
    return teams
