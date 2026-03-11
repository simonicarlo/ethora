from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

import uuid

import anthropic
from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from starlette.responses import StreamingResponse

from app.api.v1.deps import DBSession, get_or_404
from app.core.database import async_session_factory
from app.engine.council import run_council_session
from app.models.models import Council, Message, Round, Session, Verdict, Vote
from app.schemas.schemas import (
    HumanTurnRequest,
    HumanTurnResponse,
    HumanVoteRequest,
    SessionCreate,
    SessionResponse,
    SessionStateResponse,
    VerdictResponse,
)
from app.sse.emitter import format_sse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["sessions"])


@router.post("/sessions", response_model=SessionResponse, status_code=201)
async def create_session(payload: SessionCreate, db: DBSession) -> Session:
    session = Session(
        council_id=payload.council_id,
        input_claim=payload.input_claim,
        question_type=payload.question_type,
    )
    db.add(session)
    await db.flush()
    return session


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: uuid.UUID, db: DBSession) -> Session:
    return await get_or_404(db, Session, session_id, "Session not found")


@router.get("/sessions/{session_id}/messages", response_model=SessionStateResponse)
async def get_session_messages(
    session_id: uuid.UUID, db: DBSession
) -> SessionStateResponse:
    """Return all messages and votes for a session (for cold-loading on page reload)."""
    await get_or_404(db, Session, session_id, "Session not found")

    # Select Round.round_number directly from the join to avoid lazy-loading
    # the msg.round relationship (which fails in async SQLAlchemy).
    # Message.agent uses lazy="selectin" on the model, so it loads automatically.
    msg_result = await db.execute(
        select(Message, Round.round_number)
        .join(Round, Message.round_id == Round.id)
        .where(Round.session_id == session_id)
        .order_by(Round.round_number, Message.created_at)
    )
    rows = msg_result.all()

    vote_result = await db.execute(
        select(Vote).where(Vote.session_id == session_id)
    )
    votes = vote_result.scalars().all()

    msg_list: list[dict[str, object]] = [
        {
            "id": msg.id,
            "round_number": round_number,
            "agent_id": msg.agent_id,
            "agent_name": msg.agent.name if msg.agent else "Human",
            "content": msg.content,
            "created_at": msg.created_at,
        }
        for msg, round_number in rows
    ]

    return {"messages": msg_list, "votes": votes}


@router.get("/sessions/{session_id}/stream")
async def stream_session(session_id: uuid.UUID, db: DBSession) -> StreamingResponse:
    session = await get_or_404(db, Session, session_id, "Session not found")
    if session.status != "pending":
        raise HTTPException(
            status_code=409,
            detail=f"Session is '{session.status}', expected 'pending'",
        )

    async def event_generator() -> AsyncGenerator[str, None]:
        # Use a dedicated DB session — the request-scoped one closes when
        # the endpoint returns, but StreamingResponse keeps the generator alive.
        async with async_session_factory() as engine_db:
            try:
                async for event in run_council_session(session_id, engine_db):
                    yield event
            except (anthropic.APIError, SQLAlchemyError):
                logger.exception("Stream error for session %s", session_id)
                await engine_db.rollback()
                yield format_sse("error", {"message": "Stream error"})

    # media_type="text/event-stream" is the standard SSE content type;
    # browsers and EventSource clients rely on it to enable streaming parsing.
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/sessions/{session_id}/human-turn", response_model=HumanTurnResponse, status_code=202)
async def submit_human_turn(
    session_id: uuid.UUID,
    payload: HumanTurnRequest,
    db: DBSession,
) -> HumanTurnResponse:
    session = await get_or_404(db, Session, session_id, "Session not found")

    if session.status != "awaiting_human_turn":
        raise HTTPException(
            status_code=409,
            detail=f"Session is '{session.status}', expected 'awaiting_human_turn'",
        )

    # Load council to verify human turns are enabled
    council = await get_or_404(db, Council, session.council_id, "Council not found")
    if not council.allow_human_turns:
        raise HTTPException(
            status_code=409,
            detail="Council does not allow human turns",
        )

    # Find the latest round for this session
    result = await db.execute(
        select(Round)
        .where(Round.session_id == session_id)
        .order_by(Round.round_number.desc())
    )
    latest_round = result.scalars().first()
    if latest_round is None:
        raise HTTPException(status_code=409, detail="No rounds exist for this session")

    # Store human message (agent_id=None marks it as human-authored)
    msg = Message(
        round_id=latest_round.id,
        agent_id=None,
        content=payload.content,
    )
    db.add(msg)

    # Reset to pending so the stream can be reopened
    session.status = "pending"
    await db.flush()

    return HumanTurnResponse(status="accepted")


@router.post("/sessions/{session_id}/human-vote", response_model=VerdictResponse, status_code=201)
async def submit_human_vote(
    session_id: uuid.UUID,
    payload: HumanVoteRequest,
    db: DBSession,
) -> Verdict:
    session = await get_or_404(db, Session, session_id, "Session not found")
    # Guard: only allow human votes during the voting phase to prevent
    # double-voting or voting on already-completed sessions.
    if session.status != "voting":
        raise HTTPException(status_code=409, detail="Session is not in voting phase")

    council = await get_or_404(db, Council, session.council_id, "Council not found")
    if council.voting_mechanism != "human_in_loop":
        raise HTTPException(
            status_code=409,
            detail="Session does not use human_in_loop voting",
        )

    verdict = Verdict(
        session_id=session_id,
        decision=payload.decision,
        confidence=payload.confidence,
        summary=payload.reasoning,
    )
    db.add(verdict)
    session.status = "complete"
    await db.flush()
    return verdict


@router.get("/sessions/{session_id}/verdict", response_model=VerdictResponse)
async def get_verdict(session_id: uuid.UUID, db: DBSession) -> Verdict:
    # Cannot use get_or_404 here — Verdict is queried by session_id, not by its PK
    result = await db.execute(select(Verdict).where(Verdict.session_id == session_id))
    verdict = result.scalar_one_or_none()
    if verdict is None:
        raise HTTPException(status_code=404, detail="Verdict not found")
    return verdict
