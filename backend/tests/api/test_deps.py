"""Tests for the get_or_404 helper."""
from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_or_404
from app.models.models import Agent, Council, council_agents


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


async def test_list_councils_includes_agents(client: AsyncClient, db_session: AsyncSession) -> None:
    """Verify list_councils returns councils with agents populated."""
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
