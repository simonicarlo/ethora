# Backend API Tasks Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement human turn pause-resume, extract `get_or_404` helper, and add explicit `selectinload` to council list query.

**Architecture:** The engine's `run_council_session` becomes resume-aware — it checks for existing rounds and rebuilds history from DB on re-entry. A new `"awaiting_human_turn"` status pauses the SSE stream between rounds. The `get_or_404` helper DRYs up 6 repeated fetch-or-404 patterns across the API layer.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, pytest + aiosqlite

**Spec:** `docs/superpowers/specs/2026-03-10-backend-api-tasks-design.md`

---

## Chunk 1: Foundation (model, schema, helper)

### Task 1: Make `Message.agent_id` nullable

**Files:**
- Modify: `backend/app/models/models.py:83`
- Modify: `backend/app/schemas/schemas.py:10,73`

- [ ] **Step 1: Update the Message model**

In `backend/app/models/models.py`, change line 83:

```python
# Before:
agent_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("agents.id"), nullable=False)

# After:
agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"), nullable=True)
```

- [ ] **Step 2: Update SessionStatus and MessageResponse in schemas**

In `backend/app/schemas/schemas.py`, change line 10:

```python
# Before:
SessionStatus = Literal["pending", "running", "voting", "complete", "error"]

# After:
SessionStatus = Literal["pending", "running", "voting", "awaiting_human_turn", "complete", "error"]
```

And change line 73:

```python
# Before:
agent_id: uuid.UUID

# After:
agent_id: uuid.UUID | None = None
```

- [ ] **Step 3: Verify syntax parses**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -c "import app.models.models; import app.schemas.schemas; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/models.py backend/app/schemas/schemas.py
git commit -m "feat: make Message.agent_id nullable and add awaiting_human_turn status

Support human-authored messages (agent_id=None) and new session status
for pause-resume human turn flow."
```

---

### Task 2: Extract `get_or_404` helper

**Files:**
- Modify: `backend/app/api/v1/deps.py`
- Test: `backend/tests/api/test_deps.py` (create)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/api/__init__.py` (empty) and `backend/tests/api/test_deps.py`:

```python
"""Tests for the get_or_404 helper."""
from __future__ import annotations

import uuid

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_or_404
from app.models.models import Agent


async def test_get_or_404_returns_existing(db_session: AsyncSession) -> None:
    agent = Agent(name="Test", system_prompt="test", model="test-model")
    db_session.add(agent)
    await db_session.flush()

    result = await get_or_404(db_session, Agent, agent.id, "Agent not found")
    assert result.id == agent.id
    assert result.name == "Test"


async def test_get_or_404_raises_on_missing(db_session: AsyncSession) -> None:
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc_info:
        await get_or_404(db_session, Agent, uuid.uuid4(), "Agent not found")
    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "Agent not found"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -m pytest tests/api/test_deps.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_or_404'`

- [ ] **Step 3: Implement `get_or_404` in deps.py**

Replace the full content of `backend/app/api/v1/deps.py`:

```python
from __future__ import annotations

import uuid
from typing import Annotated, TypeVar

from fastapi import Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
) -> T:
    """Fetch a row by primary key or raise 404."""
    result = await db.execute(select(model).where(model.id == id))  # type: ignore[attr-defined]
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj


__all__ = ["DBSession", "get_db", "get_or_404"]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -m pytest tests/api/test_deps.py -v`
Expected: 2 passed

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/deps.py backend/tests/api/__init__.py backend/tests/api/test_deps.py
git commit -m "feat: extract get_or_404 helper to deps.py

Generic fetch-by-ID-or-404 replacing 6 repeated patterns across the API layer."
```

---

### Task 3: Adopt `get_or_404` in sessions.py and councils.py + add `selectinload`

**Files:**
- Modify: `backend/app/api/v1/sessions.py`
- Modify: `backend/app/api/v1/councils.py`

- [ ] **Step 1: Refactor sessions.py to use `get_or_404`**

Replace `backend/app/api/v1/sessions.py` with:

```python
from __future__ import annotations

import logging
from collections.abc import AsyncGenerator

import uuid

from fastapi import APIRouter, HTTPException
from starlette.responses import StreamingResponse
from sqlalchemy import select

from app.api.v1.deps import DBSession, get_or_404
from app.core.database import async_session_factory
from app.engine.council import run_council_session
from app.models.models import Council, Message, Round, Session, Verdict
from app.schemas.schemas import (
    HumanTurnRequest,
    HumanVoteRequest,
    SessionCreate,
    SessionResponse,
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
    )
    db.add(session)
    await db.flush()
    return session


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: uuid.UUID, db: DBSession) -> Session:
    return await get_or_404(db, Session, session_id, "Session not found")


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
            except Exception:
                logger.exception("Stream error for session %s", session_id)
                await engine_db.rollback()
                yield format_sse("error", {"message": "Stream error"})

    # media_type="text/event-stream" is the standard SSE content type;
    # browsers and EventSource clients rely on it to enable streaming parsing.
    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/sessions/{session_id}/human-turn", status_code=202)
async def submit_human_turn(
    session_id: uuid.UUID,
    payload: HumanTurnRequest,
    db: DBSession,
) -> dict[str, str]:
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

    return {"status": "accepted"}


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
```

- [ ] **Step 2: Refactor councils.py — use `get_or_404` + add `selectinload`**

Replace `backend/app/api/v1/councils.py` with:

```python
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import DBSession, get_or_404
from app.models.models import Agent, Council, council_agents
from app.schemas.schemas import AgentCreate, AgentResponse, CouncilCreate, CouncilResponse

router = APIRouter(prefix="/api/v1", tags=["councils"])


# ── Agents ──────────────────────────────────────────────────────────────────

@router.post("/agents", response_model=AgentResponse, status_code=201)
async def create_agent(payload: AgentCreate, db: DBSession) -> Agent:
    agent = Agent(
        name=payload.name,
        system_prompt=payload.system_prompt,
        model=payload.model,
    )
    db.add(agent)
    # flush() (not commit): writes to DB to populate generated IDs, but defers
    # the final commit to the get_db dependency's transaction lifecycle.
    await db.flush()
    return agent


@router.get("/agents", response_model=list[AgentResponse])
async def list_agents(db: DBSession) -> list[Agent]:
    result = await db.execute(select(Agent))
    return list(result.scalars().all())


# ── Councils ────────────────────────────────────────────────────────────────

@router.post("/councils", response_model=CouncilResponse, status_code=201)
async def create_council(payload: CouncilCreate, db: DBSession) -> Council:
    # Fetch requested agents
    result = await db.execute(select(Agent).where(Agent.id.in_(payload.agent_ids)))
    agents = list(result.scalars().all())

    if len(agents) != len(payload.agent_ids):
        raise HTTPException(status_code=404, detail="One or more agents not found")

    council = Council(
        name=payload.name,
        rounds=payload.rounds,
        voting_mechanism=payload.voting_mechanism,
        allow_human_turns=payload.allow_human_turns,
        agents=agents,
    )
    db.add(council)
    await db.flush()
    return council


@router.get("/councils", response_model=list[CouncilResponse])
async def list_councils(db: DBSession) -> list[Council]:
    result = await db.execute(
        select(Council).options(selectinload(Council.agents))
    )
    return list(result.scalars().all())


@router.get("/councils/{council_id}", response_model=CouncilResponse)
async def get_council(council_id: uuid.UUID, db: DBSession) -> Council:
    return await get_or_404(db, Council, council_id, "Council not found")
```

- [ ] **Step 3: Add test for selectinload in list_councils**

Add to `backend/tests/api/test_deps.py` (append to the file):

```python
from app.models.models import Council, council_agents


async def test_list_councils_includes_agents(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify list_councils returns councils with agents populated."""
    from httpx import AsyncClient as _  # already in fixture

    a = Agent(name="A1", system_prompt="test", model="test-model")
    db_session.add(a)
    await db_session.flush()

    council = Council(name="C1", rounds=1, voting_mechanism="majority", allow_human_turns=False)
    db_session.add(council)
    await db_session.flush()

    await db_session.execute(council_agents.insert().values(council_id=council.id, agent_id=a.id))
    await db_session.flush()

    resp = await client.get("/api/v1/councils")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    council_data = next(c for c in data if c["id"] == str(council.id))
    assert len(council_data["agents"]) == 1
    assert council_data["agents"][0]["name"] == "A1"
```

Update imports at the top of `test_deps.py` to add:
```python
from httpx import AsyncClient
from app.models.models import Agent, Council, council_agents
```

- [ ] **Step 4: Run all tests to verify no regressions**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -m pytest tests/ -v`
Expected: All tests pass (including the new selectinload test)

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/sessions.py backend/app/api/v1/councils.py backend/tests/api/test_deps.py
git commit -m "refactor: adopt get_or_404 helper and add explicit selectinload

Replace 5 manual fetch-or-404 patterns with get_or_404.
Add selectinload(Council.agents) to list_councils query."
```

---

## Chunk 2: Engine resume + human turn pause

### Task 4: Add `_load_history_from_db` helper and update type annotations

**Files:**
- Modify: `backend/app/engine/council.py`
- Test: `backend/tests/engine/test_council_helpers.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/engine/test_council_helpers.py`:

```python
# Add at the bottom of the file:

# -- _build_agent_messages with human messages --


class TestBuildAgentMessagesHumanTurns:
    def test_human_message_becomes_user_role(self) -> None:
        agent = _make_agent("Alice")
        history: list[tuple[str, uuid.UUID | None, str]] = [
            ("Human", None, "What about edge cases?"),
        ]
        msgs = _build_agent_messages(history, agent, "claim")
        # claim (user) + human message (user) → merged into 1 user message
        assert len(msgs) == 1
        assert "[Human]: What about edge cases?" in msgs[0]["content"]

    def test_human_message_never_becomes_assistant(self) -> None:
        agent = _make_agent("Alice")
        history: list[tuple[str, uuid.UUID | None, str]] = [
            (agent.name, agent.id, "My point."),
            ("Human", None, "Interesting, but what about X?"),
            (agent.name, agent.id, "Good question."),
        ]
        msgs = _build_agent_messages(history, agent, "claim")
        # No human message should ever have assistant role
        for m in msgs:
            if "Human" in m.get("content", ""):
                assert m["role"] == "user"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -m pytest tests/engine/test_council_helpers.py::TestBuildAgentMessagesHumanTurns -v`
Expected: FAIL — type errors or assertion errors (current type annotation is `uuid.UUID`, not `uuid.UUID | None`)

- [ ] **Step 3: Update type annotations in council.py**

In `backend/app/engine/council.py`:

Change line 43:
```python
# Before:
history: list[tuple[str, uuid.UUID, str]] = []

# After:
history: list[tuple[str, uuid.UUID | None, str]] = []
```

Change line 146:
```python
# Before:
def _build_agent_messages(
    history: list[tuple[str, uuid.UUID, str]],

# After:
def _build_agent_messages(
    history: list[tuple[str, uuid.UUID | None, str]],
```

Change line 161-162 to handle `None` agent_id:
```python
# Before:
    for name, agent_id, content in history:
        if agent_id == current_agent.id:

# After:
    for name, agent_id, content in history:
        if agent_id is not None and agent_id == current_agent.id:
```

Change line 187:
```python
# Before:
def _build_voting_prompt(
    input_claim: str,
    history: list[tuple[str, uuid.UUID, str]],

# After:
def _build_voting_prompt(
    input_claim: str,
    history: list[tuple[str, uuid.UUID | None, str]],
```

- [ ] **Step 4: Add `_load_history_from_db` helper**

Add after `_parse_vote` (at the bottom of `backend/app/engine/council.py`):

```python

async def _load_history_from_db(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> list[tuple[str, uuid.UUID | None, str]]:
    """Rebuild debate history from persisted messages.

    Returns the same (name, agent_id, content) tuple format used by the
    in-memory history. Human messages have agent_id=None and name="Human".
    """
    result = await db.execute(
        select(Message)
        .join(Round, Message.round_id == Round.id)
        .where(Round.session_id == session_id)
        .options(selectinload(Message.agent))
        .order_by(Round.round_number, Message.created_at)
    )
    messages = result.scalars().all()

    history: list[tuple[str, uuid.UUID | None, str]] = []
    for msg in messages:
        if msg.agent_id is None:
            history.append(("Human", None, msg.content))
        else:
            history.append((msg.agent.name, msg.agent_id, msg.content))
    return history
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -m pytest tests/engine/test_council_helpers.py -v`
Expected: All pass (including the 2 new ones)

- [ ] **Step 6: Commit**

```bash
git add backend/app/engine/council.py backend/tests/engine/test_council_helpers.py
git commit -m "feat: add _load_history_from_db and update history type for human messages

History tuples now use uuid.UUID | None to support human-authored messages.
_build_agent_messages treats None agent_id as user role with [Human]: prefix."
```

---

### Task 5: Make `run_council_session` resume-aware with human turn pause

**Files:**
- Modify: `backend/app/engine/council.py:20-72`
- Test: `backend/tests/engine/test_council.py`

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/engine/test_council.py`. First update `_seed_council` to accept `allow_human_turns`:

```python
# Change the _seed_council function signature and Council creation:

async def _seed_council(
    db: AsyncSession,
    *,
    num_agents: int = 2,
    rounds: int = 1,
    voting_mechanism: str = "majority",
    allow_human_turns: bool = False,
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
        allow_human_turns=allow_human_turns,
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
```

Then add these tests at the bottom of the file:

```python
# -- History Rebuild from DB --


async def test_load_history_from_db(db: AsyncSession) -> None:
    """Verify _load_history_from_db rebuilds history from persisted messages."""
    from app.engine.council import _load_history_from_db

    session = await _seed_council(db, num_agents=2, rounds=1)
    agents_result = await db.execute(
        select(Agent).join(council_agents).where(council_agents.c.council_id == session.council_id)
    )
    agents = agents_result.scalars().all()

    # Create a round with agent messages and a human message
    round_ = Round(session_id=session.id, round_number=1)
    db.add(round_)
    await db.flush()

    msg1 = Message(round_id=round_.id, agent_id=agents[0].id, content="Agent 0 says hi")
    msg2 = Message(round_id=round_.id, agent_id=None, content="Human chimes in")
    msg3 = Message(round_id=round_.id, agent_id=agents[1].id, content="Agent 1 responds")
    db.add_all([msg1, msg2, msg3])
    await db.flush()

    history = await _load_history_from_db(db, session.id)

    assert len(history) == 3
    # Agent messages have name and UUID
    assert history[0] == (agents[0].name, agents[0].id, "Agent 0 says hi")
    # Human message has name="Human" and agent_id=None
    assert history[1] == ("Human", None, "Human chimes in")
    assert history[2] == (agents[1].name, agents[1].id, "Agent 1 responds")


# -- Human Turn Pause/Resume Tests --


async def test_human_turn_pauses_after_round(db: AsyncSession) -> None:
    """With allow_human_turns=True and 2 rounds, engine pauses after round 1."""
    session = await _seed_council(db, num_agents=2, rounds=2, allow_human_turns=True)

    async def mock_call_agent(agent, messages, system_prompt):
        return f"Response from {agent.name}"

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    event_types = [e[0] for e in parsed]

    # Should have round 1 messages and round_complete, then pause
    assert "agent_message" in event_types
    assert "round_complete" in event_types
    assert "awaiting_human_turn" in event_types
    # Should NOT have voting or verdict (paused before round 2)
    assert "verdict" not in event_types

    # Session should be in awaiting_human_turn status
    result = await db.execute(select(Session).where(Session.id == session.id))
    s = result.scalar_one()
    assert s.status == "awaiting_human_turn"


async def test_human_turn_no_pause_on_last_round(db: AsyncSession) -> None:
    """With allow_human_turns=True and 1 round, no pause (goes to voting)."""
    session = await _seed_council(db, num_agents=2, rounds=1, allow_human_turns=True)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.9)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    event_types = [e[0] for e in parsed]

    assert "awaiting_human_turn" not in event_types
    assert "verdict" in event_types


async def test_human_turn_no_pause_when_disabled(db: AsyncSession) -> None:
    """With allow_human_turns=False, no pause even with multiple rounds."""
    session = await _seed_council(db, num_agents=2, rounds=2, allow_human_turns=False)

    async def mock_call_agent(agent, messages, system_prompt):
        return _mock_agent_vote_json("true", 0.9)

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    event_types = [e[0] for e in parsed]

    assert "awaiting_human_turn" not in event_types
    assert "verdict" in event_types


async def test_resume_after_human_turn(db: AsyncSession) -> None:
    """Engine resumes from round 2 after a human turn was injected."""
    session = await _seed_council(db, num_agents=2, rounds=2, allow_human_turns=True)

    async def mock_call_agent(agent, messages, system_prompt):
        return f"Response from {agent.name}"

    # Run round 1 — engine will pause
    with patch("app.engine.council.call_agent", side_effect=mock_call_agent):
        async for _ in run_council_session(session.id, db):
            pass

    # Simulate human turn: add a human message and reset status
    result = await db.execute(
        select(Round)
        .where(Round.session_id == session.id)
        .order_by(Round.round_number.desc())
    )
    latest_round = result.scalars().first()
    human_msg = Message(round_id=latest_round.id, agent_id=None, content="Human input here")
    db.add(human_msg)
    session.status = "pending"
    await db.flush()

    # Resume — engine should run round 2 and proceed to voting
    vote_mock_count = 0

    async def mock_call_agent_vote(agent, messages, system_prompt):
        nonlocal vote_mock_count
        vote_mock_count += 1
        # First 2 calls are round 2 debate, next 2 are votes
        if vote_mock_count <= 2:
            return f"Round 2 response from {agent.name}"
        return _mock_agent_vote_json("true", 0.85)

    # Need to re-query session since status changed
    db.expire_all()

    with patch("app.engine.council.call_agent", side_effect=mock_call_agent_vote):
        events = []
        async for event in run_council_session(session.id, db):
            events.append(event)

    parsed = _parse_sse_events(events)
    event_types = [e[0] for e in parsed]

    # Should have round 2 messages and verdict
    assert "agent_message" in event_types
    assert "round_complete" in event_types
    assert "verdict" in event_types
    # Should NOT pause again (this is the last round)
    assert "awaiting_human_turn" not in event_types

    # Verify round 2 was created
    result = await db.execute(
        select(Round).where(Round.session_id == session.id).order_by(Round.round_number)
    )
    rounds = result.scalars().all()
    assert len(rounds) == 2
    assert rounds[1].round_number == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -m pytest tests/engine/test_council.py::test_human_turn_pauses_after_round -v`
Expected: FAIL — no `awaiting_human_turn` event in output

- [ ] **Step 3: Implement resume-aware engine with human turn pause**

Replace lines 20-72 of `backend/app/engine/council.py` (the `run_council_session` function body through the round loop). The full updated function:

```python
async def run_council_session(
    session_id: uuid.UUID, db: AsyncSession
) -> AsyncGenerator[str, None]:
    """Orchestrates rounds of deliberation, yielding SSE events.

    Resume-aware: if rounds already exist (from a prior run that paused for
    a human turn), rebuilds history from DB and continues from the next round.
    """

    # -- Load session with council + agents --
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(
            selectinload(Session.council).selectinload(Council.agents),
        )
    )
    session = result.scalar_one()
    council: Council = session.council
    agents: list[Agent] = council.agents

    try:
        # -- Mark running --
        session.status = "running"
        await db.flush()

        # -- Determine resume point --
        existing_rounds_result = await db.execute(
            select(Round)
            .where(Round.session_id == session.id)
            .order_by(Round.round_number)
        )
        existing_rounds = existing_rounds_result.scalars().all()
        start_round = len(existing_rounds) + 1

        # Rebuild history from DB if resuming
        if existing_rounds:
            history = await _load_history_from_db(db, session.id)
        else:
            history: list[tuple[str, uuid.UUID | None, str]] = []

        # -- Round loop --
        for round_num in range(start_round, council.rounds + 1):
            db_round = Round(session_id=session.id, round_number=round_num)
            db.add(db_round)
            await db.flush()

            for agent in agents:
                messages = _build_agent_messages(history, agent, session.input_claim)
                content = await call_agent(agent, messages, agent.system_prompt)

                msg = Message(
                    round_id=db_round.id,
                    agent_id=agent.id,
                    content=content,
                )
                db.add(msg)
                await db.flush()

                history.append((agent.name, agent.id, content))

                yield format_sse("agent_message", {
                    "agent_id": str(agent.id),
                    "agent_name": agent.name,
                    "round": round_num,
                    "content": content,
                })

            yield format_sse("round_complete", {"round": round_num})

            # -- Human turn pause --
            if council.allow_human_turns and round_num < council.rounds:
                session.status = "awaiting_human_turn"
                await db.commit()
                yield format_sse("awaiting_human_turn", {
                    "round": round_num,
                    "message": "Waiting for human input",
                })
                return

        # -- Voting phase --
        session.status = "voting"
        await db.flush()

        votes: list[Vote] = []
        for agent in agents:
            voting_prompt = _build_voting_prompt(session.input_claim, history)
            vote_messages = [{"role": "user", "content": voting_prompt}]
            raw_vote = await call_agent(agent, vote_messages, agent.system_prompt)
            parsed = _parse_vote(raw_vote)

            try:
                confidence = float(parsed.get("confidence", 0.0))
            except (TypeError, ValueError):
                confidence = 0.0

            vote = Vote(
                session_id=session.id,
                agent_id=agent.id,
                value=parsed.get("value", "abstain"),
                confidence=confidence,
                reasoning=parsed.get("reasoning"),
            )
            db.add(vote)
            await db.flush()
            votes.append(vote)

            yield format_sse("voting_cast", {
                "agent_id": str(agent.id),
                "agent_name": agent.name,
                "vote": vote.value,
                "confidence": vote.confidence,
                "reasoning": vote.reasoning,
            })

        # -- Tally --
        try:
            tally = await tally_votes(votes, council.voting_mechanism)  # type: ignore[arg-type]
        except HumanVoteRequired:
            yield format_sse("awaiting_human_vote", {
                "message": "Waiting for human to cast deciding vote",
            })
            await db.commit()
            return

        verdict = Verdict(
            session_id=session.id,
            decision=tally["decision"],
            confidence=tally.get("confidence"),
            summary=tally.get("summary"),
        )
        db.add(verdict)
        session.status = "complete"
        await db.flush()

        yield format_sse("verdict", {
            "decision": str(tally["decision"]),
            "confidence": tally.get("confidence"),
            "summary": tally.get("summary"),
        })

        await db.commit()

    except Exception:
        logger.exception("Council session %s failed", session_id)
        await db.rollback()
        session.status = "error"
        await db.commit()
        yield format_sse("error", {"message": "Internal engine error"})
```

- [ ] **Step 4: Run all council tests**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -m pytest tests/engine/test_council.py -v`
Expected: All pass (existing + 5 new: load_history_from_db, pause, no_pause_last_round, no_pause_disabled, resume)

- [ ] **Step 5: Commit**

```bash
git add backend/app/engine/council.py backend/tests/engine/test_council.py
git commit -m "feat: implement human turn pause-resume in council engine

Engine pauses after each round when allow_human_turns is enabled,
yielding awaiting_human_turn SSE event. On re-entry, rebuilds history
from DB and resumes from the next round number."
```

---

## Chunk 3: API endpoint tests + full integration

### Task 6: Add API-level tests for `submit_human_turn`

**Files:**
- Create: `backend/tests/api/test_sessions.py`

- [ ] **Step 1: Write the API tests**

Create `backend/tests/api/test_sessions.py`:

```python
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
```

- [ ] **Step 2: Run API tests**

Run: `cd /Users/shost/workspaces/ethora/backend && python3 -m pytest tests/api/test_sessions.py -v`
Expected: All 4 pass

- [ ] **Step 3: Commit**

```bash
git add backend/tests/api/test_sessions.py
git commit -m "test: add API-level tests for submit_human_turn endpoint

Tests cover: success (202), wrong status (409), not found (404),
and human turns disabled (409)."
```

---

### Task 7: Run full test suite and update TODO.md

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/shost/workspaces/ethora && bash run-tests.sh`
Expected: All backend and frontend tests pass

- [ ] **Step 2: Update TODO.md**

Check off completed items:

```markdown
# Before:
- [ ] **Implement human turn injection** (`sessions.py:submit_human_turn`) — Store human message in current round, signal the engine to continue
- [ ] **Add `selectinload` to council list query** — `list_councils` relies on lazy="selectin" default which causes N+1; add explicit `options(selectinload(Council.agents))`
- [ ] **Extract `get_or_404` helper** — Repeated fetch-by-ID-or-404 pattern in `sessions.py` (3x) and `councils.py` (1x); extract to `deps.py`

# After:
- [x] **Implement human turn injection** (`sessions.py:submit_human_turn`) — Pause-resume: engine pauses after each round, human submits message, stream resumes
- [x] **Add `selectinload` to council list query** — Added explicit `options(selectinload(Council.agents))` to `list_councils`
- [x] **Extract `get_or_404` helper** — Generic fetch-by-ID-or-404 in `deps.py`, adopted across sessions.py and councils.py
```

- [ ] **Step 3: Commit**

```bash
git add TODO.md
git commit -m "docs: check off completed backend API tasks in TODO.md"
```

- [ ] **Step 4: Final verification**

Run: `cd /Users/shost/workspaces/ethora && bash run-tests.sh`
Expected: All tests pass
