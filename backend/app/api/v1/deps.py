from __future__ import annotations

from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db

# Annotated type alias: lets endpoints declare `db: DBSession` instead of
# repeating `db: AsyncSession = Depends(get_db)` on every signature.
DBSession = Annotated[AsyncSession, Depends(get_db)]

__all__ = ["DBSession", "get_db"]
