from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings

engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    pool_size=10,  # Increased from default 5
    max_overflow=20,  # Increased from default 10
    pool_recycle=3600,  # Recycle connections after 1 hour
    pool_timeout=30,
    echo_pool=False,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
