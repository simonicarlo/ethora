"""Pytest configuration — sets DATABASE_URL before any app imports."""
from __future__ import annotations

import os

# Override DATABASE_URL to use in-memory SQLite for all tests.
# This must happen before any app module is imported, because
# database.py eagerly creates the engine at module level.
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["ANTHROPIC_API_KEY"] = "test-key"

from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.database import Base, engine as app_engine, get_db
from app.main import app

# Reuse the app's engine (which is now SQLite thanks to the env override above)
# so all fixtures and production code share the same in-memory database.
TestSessionFactory = async_sessionmaker(app_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture()
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """Create all tables, yield a session, then drop everything."""
    async with app_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with TestSessionFactory() as session:
        yield session

    async with app_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture()
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Async HTTP client with the DB dependency overridden to use the test session."""

    async def _override_get_db() -> AsyncGenerator[AsyncSession, None]:
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise

    app.dependency_overrides[get_db] = _override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
