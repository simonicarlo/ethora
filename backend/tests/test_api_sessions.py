from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


@pytest.fixture()
async def council_id(client: AsyncClient) -> str:
    """Create two agents and a council, return the council id."""
    agent_ids = []
    for name in ("S-Agent A", "S-Agent B"):
        resp = await client.post(
            "/api/v1/agents",
            json={"name": name, "system_prompt": f"You are {name}."},
        )
        agent_ids.append(resp.json()["id"])

    resp = await client.post(
        "/api/v1/councils",
        json={"name": "Session Council", "agent_ids": agent_ids},
    )
    return resp.json()["id"]


class TestSessionEndpoints:
    async def test_create_session(self, client: AsyncClient, council_id: str) -> None:
        resp = await client.post(
            "/api/v1/sessions",
            json={"council_id": council_id, "input_claim": "The sky is blue."},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["status"] == "pending"
        assert body["input_claim"] == "The sky is blue."

    async def test_get_session(self, client: AsyncClient, council_id: str) -> None:
        create_resp = await client.post(
            "/api/v1/sessions",
            json={"council_id": council_id, "input_claim": "Test claim"},
        )
        session_id = create_resp.json()["id"]
        resp = await client.get(f"/api/v1/sessions/{session_id}")
        assert resp.status_code == 200
        assert resp.json()["id"] == session_id

    async def test_get_session_not_found(self, client: AsyncClient) -> None:
        resp = await client.get(f"/api/v1/sessions/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_verdict_not_found(self, client: AsyncClient, council_id: str) -> None:
        create_resp = await client.post(
            "/api/v1/sessions",
            json={"council_id": council_id, "input_claim": "No verdict yet"},
        )
        session_id = create_resp.json()["id"]
        resp = await client.get(f"/api/v1/sessions/{session_id}/verdict")
        assert resp.status_code == 404

    async def test_human_vote_not_in_voting_phase(
        self, client: AsyncClient, council_id: str
    ) -> None:
        create_resp = await client.post(
            "/api/v1/sessions",
            json={"council_id": council_id, "input_claim": "Not voting yet"},
        )
        session_id = create_resp.json()["id"]
        resp = await client.post(
            f"/api/v1/sessions/{session_id}/human-vote",
            json={"decision": "true", "confidence": 0.9, "reasoning": "Because"},
        )
        assert resp.status_code == 409
