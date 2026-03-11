from __future__ import annotations

import uuid
from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.strategy_options import Load

from app.core.database import Base, get_db
from app.models.models import Council, Session, Verdict
from app.schemas.schemas import SessionListItem, SessionStatus

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


async def build_session_list(
    db: AsyncSession,
    *,
    council_id: uuid.UUID | None = None,
    status: SessionStatus | None = None,
    skip: int = 0,
    limit: int = 50,
) -> list[SessionListItem]:
    """Shared query for listing sessions with council name and verdict summary."""
    stmt = (
        select(
            Session,
            Council.name.label("council_name"),
            Verdict.summary.label("verdict_summary"),
        )
        .join(Council, Session.council_id == Council.id)
        .outerjoin(Verdict, Verdict.session_id == Session.id)
        .order_by(Session.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    if council_id is not None:
        stmt = stmt.where(Session.council_id == council_id)
    if status is not None:
        stmt = stmt.where(Session.status == status)
    result = await db.execute(stmt)
    return [
        SessionListItem(
            id=session.id,
            council_id=session.council_id,
            council_name=council_name,
            input_claim=session.input_claim,
            question_type=session.question_type,
            status=session.status,
            verdict_summary=verdict_summary,
            created_at=session.created_at,
        )
        for session, council_name, verdict_summary in result.all()
    ]


__all__ = ["DBSession", "get_db", "get_or_404", "build_session_list"]
