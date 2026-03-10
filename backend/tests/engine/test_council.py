"""Integration tests for engine/council.py — run_council_session orchestrator.

Uses an in-memory SQLite database and mocked LLM calls to test the full
deliberation flow without external dependencies.
"""
from __future__ import annotations

import json
import uuid
from unittest.mock import patch

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.database import Base
from app.engine.council import run_council_session
from app.models.models import (
    Agent,
    Council,
    Message,
    Round,
    Session,
    Verdict,
    Vote,
    council_agents,
)


# -- Fixtures --


@pytest.fixture
async def engine():
    """Create an in-memory async SQLite engine."""
    eng = create_async_engine("sqlite+aiosqlite://", echo=False)
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await eng.dispose()


@pytest.fixture
async def db(engine):
    """Create a session bound to the test engine."""
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as session:
        yield session


async def _seed_council(
    db: AsyncSession,
    *,
    num_agents: int = 2,
    rounds: int = 1,
    voting_mechanism: str = "majority",
) -> Session:
    """Create agents, council, and session. Returns the Session."""
    agents = []
    for i in range(num_agents):
        a = Agent(name=f"Agent-{i}", system_prompt=f"You are agent {i}.", model="test-model")
        db.add(a)
        agents.append(a)
    await db.flush()

    council = Council(
        name="Test Council",
        rounds=rounds,
        voting_mechanism=voting_mechanism,
        allow_human_turns=False,
    )
    db.add(council)
    await db.flush()

    # Link agents to council via association table
    for a in agents:
        await db.execute(council_agents.insert().values(council_id=council.id, agent_id=a.id))
    await db.flush()

    # Refresh to load the agents relationship
    await db.refresh(council, ["agents"])

    session = Session(council_id=council.id, input_claim="Is testing important?")
    db.add(session)
    await db.flush()

    return session


def _mock_agent_vote_json(value: str = "true", confidence: float = 0.85) -> str:
    return json.dumps({"value": value, "confidence": confidence, "reasoning": "test reasoning"})


def _parse_sse_events(events: list[str]) -> list[tuple[str, dict]]:
    """Parse raw SSE strings into (event_type, data) tuples."""
    parsed = []
    for raw in events:
        lines = raw.strip().split("\n")
        event_type = ""
        data = {}
        for line in lines:
            if line.startswith("event: "):
                event_type = line[7:]
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        parsed.append((event_type, data))
    return parsed


# -- Tests --


async def test_full_session_majority_vote(db: AsyncSession) -> None:
    """Full flow: 1 round, 2 agents, majority vote → verdict."""
    session = await _seed_council(db, num_agents=2, rounds=1, voting_mechanism="majority")
    call_count = 0

    async def mock_call_agent(agent, messages, system_prompt):
        nonlocal call_count
        call_count += 1
        # First 2 calls are debate, next 2 are votes
        if call_count <= 2:
            return f"Debate response from {agent.name}"
        return _mock_agent_vote_json("true", 0.9)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    event_types = [e[0] for e in parsed]

    assert "agent_message" in event_types
    assert "round_complete" in event_types
    assert "voting_cast" in event_types
    assert "verdict" in event_types
    assert "error" not in event_types

    # Verify session status
    result = await db.execute(select(Session).where(Session.id == session.id))
    s = result.scalar_one()
    assert s.status == "complete"


async def test_session_status_transitions(db: AsyncSession) -> None:
    """Verify status goes: pending → running → voting → complete."""
    session = await _seed_council(db, num_agents=2, rounds=1)
    statuses: list[str] = []

    original_flush = db.flush

    async def tracking_flush(*args, **kwargs):
        await original_flush(*args, **kwargs)
        result = await db.execute(select(Session).where(Session.id == session.id))
        s = result.scalar_one()
        if not statuses or statuses[-1] != s.status:
            statuses.append(s.status)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.8)

    with (
        patch("app.engine.council.call_agent", side_effect=mock_call_agent),
        patch.object(db, "flush", side_effect=tracking_flush),
    ):
        async for _ in run_council_session(session.id, db):
            pass

    assert "running" in statuses
    assert "voting" in statuses
    assert "complete" in statuses


async def test_multiple_rounds(db: AsyncSession) -> None:
    """Verify correct number of round_complete events for multi-round session."""
    session = await _seed_council(db, num_agents=2, rounds=3)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.9)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    round_completes = [e for e in parsed if e[0] == "round_complete"]
    assert len(round_completes) == 3
    assert [e[1]["round"] for e in round_completes] == [1, 2, 3]

    agent_messages = [e for e in parsed if e[0] == "agent_message"]
    # 2 agents × 3 rounds = 6 messages
    assert len(agent_messages) == 6


async def test_agent_messages_persisted(db: AsyncSession) -> None:
    """Verify messages are saved to the DB."""
    session = await _seed_council(db, num_agents=2, rounds=1)

    async def mock_call_agent(agent, messages, system_prompt):
        return f"Response from {agent.name}"

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        async for _ in run_council_session(session.id, db):
            pass

    result = await db.execute(select(Message))
    messages = result.scalars().all()
    assert len(messages) == 2
    contents = {m.content for m in messages}
    assert any("Agent-0" in c for c in contents)
    assert any("Agent-1" in c for c in contents)


async def test_votes_persisted(db: AsyncSession) -> None:
    """Verify votes are saved to the DB."""
    session = await _seed_council(db, num_agents=2, rounds=1)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.75)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        async for _ in run_council_session(session.id, db):
            pass

    result = await db.execute(select(Vote).where(Vote.session_id == session.id))
    votes = result.scalars().all()
    assert len(votes) == 2
    assert all(v.value == "true" for v in votes)
    assert all(v.confidence == 0.75 for v in votes)


async def test_verdict_persisted(db: AsyncSession) -> None:
    """Verify verdict is saved to the DB."""
    session = await _seed_council(db, num_agents=2, rounds=1)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("false", 0.8)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        async for _ in run_council_session(session.id, db):
            pass

    result = await db.execute(select(Verdict).where(Verdict.session_id == session.id))
    verdict = result.scalar_one()
    assert verdict.decision == "false"


async def test_rounds_persisted(db: AsyncSession) -> None:
    """Verify round rows are created in the DB."""
    session = await _seed_council(db, num_agents=2, rounds=2)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.9)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        async for _ in run_council_session(session.id, db):
            pass

    result = await db.execute(
        select(Round).where(Round.session_id == session.id).order_by(Round.round_number)
    )
    rounds = result.scalars().all()
    assert len(rounds) == 2
    assert rounds[0].round_number == 1
    assert rounds[1].round_number == 2


async def test_human_in_loop_yields_awaiting_event(db: AsyncSession) -> None:
    """human_in_loop mechanism should yield awaiting_human_vote and stop."""
    session = await _seed_council(db, num_agents=2, rounds=1, voting_mechanism="human_in_loop")

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.9)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    event_types = [e[0] for e in parsed]

    assert "awaiting_human_vote" in event_types
    assert "verdict" not in event_types

    # Session should remain in "voting" status
    result = await db.execute(select(Session).where(Session.id == session.id))
    s = result.scalar_one()
    assert s.status == "voting"


async def test_weighted_voting(db: AsyncSession) -> None:
    """Weighted voting: high-confidence minority should win."""
    session = await _seed_council(db, num_agents=3, rounds=1, voting_mechanism="weighted")
    call_count = 0

    async def mock_call_agent(agent, messages, system_prompt):
        nonlocal call_count
        call_count += 1
        # First 3 are debate, next 3 are votes
        if call_count <= 3:
            return "Debate point."
        # Agent 0 votes true with 0.95, agents 1-2 vote false with 0.1 each
        if call_count == 4:
            return _mock_agent_vote_json("true", 0.95)
        return _mock_agent_vote_json("false", 0.1)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    verdict_events = [e for e in parsed if e[0] == "verdict"]
    assert len(verdict_events) == 1
    assert verdict_events[0][1]["decision"] == "true"


async def test_consensus_disagreement(db: AsyncSession) -> None:
    """Consensus voting with disagreement → no_consensus."""
    session = await _seed_council(db, num_agents=2, rounds=1, voting_mechanism="consensus")
    call_count = 0

    async def mock_call_agent(agent, messages, system_prompt):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            return "Debate."
        if call_count == 3:
            return _mock_agent_vote_json("true", 0.9)
        return _mock_agent_vote_json("false", 0.8)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    verdict_events = [e for e in parsed if e[0] == "verdict"]
    assert verdict_events[0][1]["decision"] == "no_consensus"


async def test_llm_error_sets_error_status(db: AsyncSession) -> None:
    """LLM call failure should set session to error status and yield error SSE."""
    session = await _seed_council(db, num_agents=2, rounds=1)
    session_id = session.id
    # Commit seed data so rollback in error handler doesn't undo it.
    await db.commit()

    async def mock_call_agent(agent, messages, system_prompt):
        raise RuntimeError("API connection failed")

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session_id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    event_types = [e[0] for e in parsed]
    assert "error" in event_types

    # After rollback + re-commit inside the error handler, we need to
    # expire cached state before re-querying.
    db.expire_all()
    result = await db.execute(select(Session).where(Session.id == session_id))
    s = result.scalar_one()
    assert s.status == "error"


async def test_malformed_vote_falls_back_to_abstain(db: AsyncSession) -> None:
    """Agent returning non-JSON vote should be recorded as abstain."""
    session = await _seed_council(db, num_agents=2, rounds=1)
    call_count = 0

    async def mock_call_agent(agent, messages, system_prompt):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            return "Debate."
        return "I think the answer is probably true but I'm not sure"

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    result = await db.execute(select(Vote).where(Vote.session_id == session.id))
    votes = result.scalars().all()
    assert all(v.value == "abstain" for v in votes)
    assert all(v.confidence == 0.0 for v in votes)


async def test_sse_event_format(db: AsyncSession) -> None:
    """Verify SSE events follow the expected format."""
    session = await _seed_council(db, num_agents=2, rounds=1)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.8)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    for raw in events:
        assert raw.startswith("event: ")
        assert "\ndata: " in raw
        assert raw.endswith("\n\n")
        # Data should be valid JSON
        data_line = raw.split("\ndata: ")[1].rstrip("\n")
        json.loads(data_line)


async def test_agent_message_event_fields(db: AsyncSession) -> None:
    """agent_message events should have all required fields."""
    session = await _seed_council(db, num_agents=2, rounds=1)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.9)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    agent_msgs = [e[1] for e in parsed if e[0] == "agent_message"]
    assert len(agent_msgs) == 2
    for msg in agent_msgs:
        assert "agent_id" in msg
        assert "agent_name" in msg
        assert "round" in msg
        assert "content" in msg
        # agent_id should be a valid UUID string
        uuid.UUID(msg["agent_id"])
