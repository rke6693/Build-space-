"""
OmniSight — Database Session Management
Async SQLAlchemy with connection pooling, health checks, and proper lifecycle.
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool

from api.config import get_settings
from api.models import Base

logger = structlog.get_logger(__name__)

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


async def init_db() -> None:
    """Initialize the database engine and session factory."""
    global _engine, _session_factory
    settings = get_settings()

    # Use NullPool in testing, QueuePool (default) in production
    pool_kwargs = {}
    if settings.env == "testing":
        pool_kwargs["poolclass"] = NullPool
    else:
        pool_kwargs.update(
            pool_size=settings.db.pool_size,
            max_overflow=settings.db.max_overflow,
            pool_timeout=settings.db.pool_timeout,
            pool_recycle=settings.db.pool_recycle,
            pool_pre_ping=True,  # Verify connections before checkout
        )

    _engine = create_async_engine(
        settings.db.url,
        echo=settings.db.echo,
        **pool_kwargs,
    )

    _session_factory = async_sessionmaker(
        bind=_engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    logger.info(
        "database_initialized",
        url=settings.db.url.split("@")[-1],  # Log host only, not credentials
        pool_size=settings.db.pool_size,
    )


async def close_db() -> None:
    """Dispose of the engine and all pooled connections."""
    global _engine, _session_factory
    if _engine:
        await _engine.dispose()
        logger.info("database_closed")
    _engine = None
    _session_factory = None


async def create_tables() -> None:
    """Create all tables (development only — use Alembic in production)."""
    if _engine is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("database_tables_created")


def get_engine() -> AsyncEngine:
    if _engine is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        raise RuntimeError("Database not initialized. Call init_db() first.")
    return _session_factory


@asynccontextmanager
async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide a transactional database session.
    Auto-commits on success, rolls back on exception.
    """
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency for database sessions."""
    async with get_session() as session:
        yield session


async def check_db_health() -> dict:
    """Run a lightweight health check against the database."""
    if _engine is None:
        return {"status": "not_initialized", "healthy": False}
    try:
        async with _engine.connect() as conn:
            result = await conn.execute(text("SELECT 1"))
            result.close()
        pool = _engine.pool
        return {
            "status": "healthy",
            "healthy": True,
            "pool_size": pool.size(),
            "checked_in": pool.checkedin(),
            "checked_out": pool.checkedout(),
            "overflow": pool.overflow(),
        }
    except Exception as e:
        logger.error("database_health_check_failed", error=str(e))
        return {"status": "unhealthy", "healthy": False, "error": str(e)}
