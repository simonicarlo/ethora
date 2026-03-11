"""API-level tests for session endpoints."""
from __future__ import annotations

import uuid

from httpx import AsyncClient
from sqlalchemy import select as sa_select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.models import Agent, Council, Message, Round, Session, Vote, council_agents


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


# -- GET /sessions/{id}/messages tests ----------------------------------------


async def test_get_session_messages_empty(client: AsyncClient, db_session: AsyncSession) -> None:
    session = await _seed_human_turn_session(db_session, status="pending")

    resp = await client.get(f"/api/v1/sessions/{session.id}/messages")
    assert resp.status_code == 200

    body = resp.json()
    assert body["messages"] == []
    assert body["votes"] == []


async def test_get_session_messages_with_data(client: AsyncClient, db_session: AsyncSession) -> None:
    session = await _seed_human_turn_session(db_session, status="running")

    # Get the round and agents seeded by helper
    round_result = await db_session.execute(
        sa_select(Round).where(Round.session_id == session.id)
    )
    round_ = round_result.scalars().first()
    assert round_ is not None

    agent_result = await db_session.execute(
        sa_select(Agent)
    )
    agents = agent_result.scalars().all()
    agent = agents[0]

    # Add a message
    msg = Message(round_id=round_.id, agent_id=agent.id, content="Test response")
    db_session.add(msg)
    await db_session.flush()

    # Add a vote
    vote = Vote(session_id=session.id, agent_id=agent.id, value="true", confidence=0.8, reasoning="Agreed")
    db_session.add(vote)
    await db_session.flush()

    resp = await client.get(f"/api/v1/sessions/{session.id}/messages")
    assert resp.status_code == 200

    body = resp.json()
    assert len(body["messages"]) == 1
    assert body["messages"][0]["round_number"] == 1
    assert body["messages"][0]["agent_name"] == agent.name
    assert body["messages"][0]["content"] == "Test response"

    assert len(body["votes"]) == 1
    assert body["votes"][0]["value"] == "true"
    assert body["votes"][0]["confidence"] == 0.8


async def test_get_session_messages_human_messages(client: AsyncClient, db_session: AsyncSession) -> None:
    session = await _seed_human_turn_session(db_session, status="awaiting_human_turn")

    round_result = await db_session.execute(
        sa_select(Round).where(Round.session_id == session.id)
    )
    round_ = round_result.scalars().first()
    assert round_ is not None

    # Add a human message (agent_id=None)
    msg = Message(round_id=round_.id, agent_id=None, content="Human question")
    db_session.add(msg)
    await db_session.flush()

    resp = await client.get(f"/api/v1/sessions/{session.id}/messages")
    assert resp.status_code == 200

    body = resp.json()
    assert len(body["messages"]) == 1
    assert body["messages"][0]["agent_id"] is None
    assert body["messages"][0]["agent_name"] == "Human"


async def test_get_session_messages_not_found(client: AsyncClient) -> None:
    resp = await client.get(f"/api/v1/sessions/{uuid.uuid4()}/messages")
    assert resp.status_code == 404
