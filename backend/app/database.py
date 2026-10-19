import os

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.config import settings


def _normalize_database_url(url: str) -> str:
    """Make any Postgres URL work with the installed driver.

    * Neon / Supabase / Vercel Postgres give ``postgres://...`` which
      SQLAlchemy rejects.
    * SQLAlchemy 2.1 maps plain ``postgresql://`` to psycopg v3, while
      most requirements.txt files only install psycopg2-binary.
    """
    url = url.strip()

    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]

    if url.startswith("postgresql://"):
        try:
            import psycopg2  # noqa: F401
            driver = "psycopg2"
        except ImportError:
            driver = "psycopg"
        url = f"postgresql+{driver}://" + url[len("postgresql://"):]

    return url


IS_SERVERLESS = bool(os.getenv("VERCEL"))

_engine_kwargs = {"pool_pre_ping": True}

if IS_SERVERLESS:
    # Every serverless instance is short lived; a big pool just exhausts
    # the database's connection limit. Use the provider's pooled URL
    # (e.g. Neon "-pooler" / Supabase pooler) + no app-side pool.
    _engine_kwargs["poolclass"] = NullPool
else:
    _engine_kwargs.update(
        pool_size=10,
        max_overflow=20,
        pool_recycle=1800,
    )

engine = create_engine(
    _normalize_database_url(settings.database_url),
    **_engine_kwargs,
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()
