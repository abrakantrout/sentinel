"""
SQLAlchemy Async Engine & Session Management (Phase 7 / Phase 8 Step 1).
"""

import os
from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.db.config import get_database_url


class Base(DeclarativeBase):
    """Base declarative class for all Phase 7 SQLAlchemy ORM models."""
    pass


def get_async_engine(db_url: str = None):
    """
    Creates an async SQLAlchemy engine instance.
    """
    url = db_url or get_database_url(async_driver=True)
    return create_async_engine(
        url,
        echo=False,
        future=True,
        pool_pre_ping=True
    )


def get_async_session_factory(engine=None):
    """
    Creates an async sessionmaker factory.
    """
    eng = engine or get_async_engine()
    return async_sessionmaker(
        bind=eng,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False
    )


async def get_db_session() -> AsyncGenerator[Optional[AsyncSession], None]:
    """
    FastAPI Dependency yielding scoped AsyncSession.
    Handles exception rollback and session cleanup.

    Mode Behavior:
    - Production Mode (SENTINEL_MODE=production or explicit PostgreSQL configuration):
      Must resolve to PostgreSQL. If connection/session fails, FAILS FAST.
    - Development / Test Mode (SENTINEL_MODE=development and DATABASE_URL unset):
      Yields None to allow explicit development fallback to InMemoryCaseRepository.
    """
    db_url = os.getenv("DATABASE_URL")
    sentinel_mode = os.getenv("SENTINEL_MODE", "development").lower()

    if not db_url and sentinel_mode != "production":
        yield None
        return

    factory = get_async_session_factory()
    session = factory()
    try:
        yield session
    except Exception as exc:
        await session.rollback()
        raise exc
    finally:
        await session.close()
