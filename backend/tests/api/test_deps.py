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
