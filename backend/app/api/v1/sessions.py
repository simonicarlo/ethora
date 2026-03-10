from __future__ import annotations

from collections.abc import AsyncGenerator

import uuid

from fastapi import APIRouter, HTTPException
from starlette.responses import StreamingResponse
from sqlalchemy import select

from app.api.v1.deps import DBSession
from app.models.models import Session, Verdict
from app.schemas.schemas import (
    HumanTurnRequest,
    SessionCreate,
    SessionResponse,
    VerdictResponse,
)
from app.sse.emitter import format_sse

router = APIRouter(prefix="/api/v1", tags=["sessions"])


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(payload: SessionCreate, db: DBSession) -> Session:
    session = Session(
        council_id=payload.council_id,
        input_claim=payload.input_claim,
    )
    db.add(session)
    await db.flush()
    return session


@router.get("/sessions/{session_id}/stream")
async def stream_session(session_id: uuid.UUID, db: DBSession) -> StreamingResponse:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator() -> AsyncGenerator[str, None]:
        # TODO: Wire up run_council_session and yield real SSE events.
        yield format_sse("status", {"message": "Session streaming not yet implemented"})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/sessions/{session_id}/human-turn", status_code=202)
async def submit_human_turn(
    session_id: uuid.UUID,
    payload: HumanTurnRequest,
    db: DBSession,
) -> dict[str, str]:
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    # TODO: Inject human message into the current round
    return {"status": "accepted"}


@router.get("/sessions/{session_id}/verdict", response_model=VerdictResponse)
async def get_verdict(session_id: uuid.UUID, db: DBSession) -> Verdict:
    result = await db.execute(select(Verdict).where(Verdict.session_id == session_id))
    verdict = result.scalar_one_or_none()
    if verdict is None:
        raise HTTPException(status_code=404, detail="Verdict not found")
    return verdict
