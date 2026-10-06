import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.getenv("DATABASE_URL")

if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    # SQLAlchemy 2.1 defaults "postgresql://" to the psycopg 3 driver; the installed
    # driver is psycopg2 (requirements.txt). Without this, production crashed at import.
    if DATABASE_URL.startswith("postgresql://"):
        DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
    if "sslmode=" not in DATABASE_URL and "sqlite" not in DATABASE_URL:
        sep = "&" if "?" in DATABASE_URL else "?"
        DATABASE_URL = f"{DATABASE_URL}{sep}sslmode=require"
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_size=5,
        max_overflow=10,
        echo=False,
        hide_parameters=True,  # never copy SQL parameters (personal data) into error messages / logs
    )
else:
    if os.getenv("VERCEL"):
        # A serverless /tmp SQLite file is per-instance and wiped on cold start: every
        # instance would serve different data and reports would silently disappear.
        raise RuntimeError("DATABASE_URL is not set: refusing to start production on an ephemeral SQLite file.")
    if not os.access(os.path.dirname(os.path.abspath(__file__)), os.W_OK):
        DB_PATH = "/tmp/safety.db"
    else:
        BASE_DIR = os.path.dirname(os.path.abspath(__file__))
        DB_PATH = os.path.join(BASE_DIR, "safety.db")
    DATABASE_URL = f"sqlite:///{DB_PATH}"

    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        echo=False,
        hide_parameters=True,
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
