from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient

from app.engine.agent import AgentResponse


@pytest.fixture()
async def agent_id(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/agents",
        json={"name": "Test Agent", "system_prompt": "You are helpful."},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


class TestAgentTestEndpoint:
    async def test_test_agent_success(self, client: AsyncClient, agent_id: str) -> None:
        with patch("app.api.v1.councils.call_agent", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = AgentResponse(content="I am a helpful response.")
            resp = await client.post(
                f"/api/v1/agents/{agent_id}/test",
                json={"message": "Hello, who are you?"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["response"] == "I am a helpful response."

    async def test_test_agent_not_found(self, client: AsyncClient) -> None:
        resp = await client.post(
            f"/api/v1/agents/{uuid.uuid4()}/test",
            json={"message": "Hello"},
        )
        assert resp.status_code == 404

    async def test_test_agent_empty_message(self, client: AsyncClient, agent_id: str) -> None:
        resp = await client.post(
            f"/api/v1/agents/{agent_id}/test",
            json={"message": ""},
        )
        assert resp.status_code == 422

    async def test_test_agent_llm_failure(self, client: AsyncClient, agent_id: str) -> None:
        with patch("app.api.v1.councils.call_agent", new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = RuntimeError("Rate limit exceeded")
            resp = await client.post(
                f"/api/v1/agents/{agent_id}/test",
                json={"message": "Hello"},
            )
        assert resp.status_code == 502
        assert "Rate limit exceeded" in resp.json()["detail"]
