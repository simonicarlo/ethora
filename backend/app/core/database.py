from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

# pool_pre_ping: issues a lightweight SELECT before reusing a connection,
# detecting and discarding stale connections dropped by the DB or a firewall.
engine = create_async_engine(settings.DATABASE_URL, echo=False, pool_pre_ping=True)

# expire_on_commit=False: prevents SQLAlchemy from expiring attributes after commit,
# which would trigger implicit lazy loads that fail under asyncio (no sync I/O allowed).
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Request-scoped transaction: commits if the request succeeds, rolls back on any exception.
    Endpoints only need to flush() for generated IDs — the final commit happens here."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except SQLAlchemyError:
            await session.rollback()
            raise
