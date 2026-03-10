"""API-level tests for session endpoints."""
from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Agent, Council, Message, Round, Session, council_agents


async def _seed_human_turn_session(
    db: AsyncSession,
    *,
    status: str = "awaiting_human_turn",
    allow_human_turns: bool = True,
) -> Session:
    """Create a session ready for a human turn submission."""
    agents = []
    for i in range(2):
        a = Agent(name=f"Agent-{i}", system_prompt=f"Agent {i}", model="test-model")
        db.add(a)
        agents.append(a)
    await db.flush()

    council = Council(
        name="Test Council",
        rounds=2,
        voting_mechanism="majority",
        allow_human_turns=allow_human_turns,
    )
    db.add(council)
    await db.flush()

    for a in agents:
        await db.execute(council_agents.insert().values(council_id=council.id, agent_id=a.id))
    await db.flush()

    session = Session(council_id=council.id, input_claim="Test claim", status=status)
    db.add(session)
    await db.flush()

    # Create a round so there's something to attach the human message to
    round_ = Round(session_id=session.id, round_number=1)
    db.add(round_)
    await db.flush()

    return session


async def test_submit_human_turn_success(client: AsyncClient, db_session: AsyncSession) -> None:
    session = await _seed_human_turn_session(db_session)

    resp = await client.post(
        f"/api/v1/sessions/{session.id}/human-turn",
        json={"content": "What about edge cases?"},
    )
    assert resp.status_code == 202
    assert resp.json() == {"status": "accepted"}


async def test_submit_human_turn_wrong_status(client: AsyncClient, db_session: AsyncSession) -> None:
    session = await _seed_human_turn_session(db_session, status="running")

    resp = await client.post(
        f"/api/v1/sessions/{session.id}/human-turn",
        json={"content": "Hello"},
    )
    assert resp.status_code == 409
    assert "awaiting_human_turn" in resp.json()["detail"]


async def test_submit_human_turn_not_found(client: AsyncClient) -> None:
    resp = await client.post(
        f"/api/v1/sessions/{uuid.uuid4()}/human-turn",
        json={"content": "Hello"},
    )
    assert resp.status_code == 404


async def test_submit_human_turn_disabled(client: AsyncClient, db_session: AsyncSession) -> None:
    session = await _seed_human_turn_session(
        db_session, status="awaiting_human_turn", allow_human_turns=False
    )

    resp = await client.post(
        f"/api/v1/sessions/{session.id}/human-turn",
        json={"content": "Hello"},
    )
    assert resp.status_code == 409
    assert "human turns" in resp.json()["detail"].lower()
