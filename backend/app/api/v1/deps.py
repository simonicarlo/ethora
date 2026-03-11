from __future__ import annotations

import uuid
from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.strategy_options import Load

from app.core.database import Base, get_db

# Annotated type alias: lets endpoints declare `db: DBSession` instead of
# repeating `db: AsyncSession = Depends(get_db)` on every signature.
DBSession = Annotated[AsyncSession, Depends(get_db)]

T = TypeVar("T", bound=Base)


async def get_or_404(
    db: AsyncSession,
    model: type[T],
    id: uuid.UUID,
    detail: str = "Not found",
    options: list[Load] | None = None,
) -> T:
    """Fetch a row by primary key or raise 404.

    Args:
        options: SQLAlchemy loader options (e.g. selectinload) to apply to the query.
    """
    stmt = select(model).where(model.id == id)  # type: ignore[attr-defined]
    if options:
        stmt = stmt.options(*options)
    result = await db.execute(stmt)
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj


__all__ = ["DBSession", "get_db", "get_or_404"]
