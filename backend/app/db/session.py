"""
SQLAlchemy Async Engine & Session Management (Phase 7).
"""

from typing import AsyncGenerator
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
