from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient


@pytest.fixture()
async def two_agents(client: AsyncClient) -> list[str]:
    """Create two agents and return their ids."""
    ids = []
    for name in ("Agent A", "Agent B"):
        resp = await client.post(
            "/api/v1/agents",
            json={"name": name, "system_prompt": f"You are {name}."},
        )
        assert resp.status_code == 201
        ids.append(resp.json()["id"])
    return ids


class TestAgentEndpoints:
    async def test_create_agent(self, client: AsyncClient) -> None:
        resp = await client.post(
            "/api/v1/agents",
            json={"name": "Tester", "system_prompt": "You test things."},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "Tester"
        assert "id" in body

    async def test_list_agents(self, client: AsyncClient) -> None:
        # Create one agent first
        await client.post(
            "/api/v1/agents",
            json={"name": "Lister", "system_prompt": "You list things."},
        )
        resp = await client.get("/api/v1/agents")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
        assert len(resp.json()) >= 1

    async def test_list_agents_pagination(self, client: AsyncClient) -> None:
        for i in range(3):
            await client.post(
                "/api/v1/agents",
                json={"name": f"Agent {i}", "system_prompt": f"Prompt {i}"},
            )
        resp = await client.get("/api/v1/agents", params={"limit": 2})
        assert resp.status_code == 200
        assert len(resp.json()) == 2

        resp = await client.get("/api/v1/agents", params={"skip": 2})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_get_agent(self, client: AsyncClient) -> None:
        create_resp = await client.post(
            "/api/v1/agents",
            json={"name": "Fetchable", "system_prompt": "I can be fetched."},
        )
        agent_id = create_resp.json()["id"]
        resp = await client.get(f"/api/v1/agents/{agent_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Fetchable"

    async def test_get_agent_not_found(self, client: AsyncClient) -> None:
        resp = await client.get(f"/api/v1/agents/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_update_agent(self, client: AsyncClient) -> None:
        create_resp = await client.post(
            "/api/v1/agents",
            json={"name": "Original", "system_prompt": "Original prompt."},
        )
        agent_id = create_resp.json()["id"]
        resp = await client.put(
            f"/api/v1/agents/{agent_id}",
            json={"name": "Updated"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated"
        assert resp.json()["system_prompt"] == "Original prompt."

    async def test_update_agent_not_found(self, client: AsyncClient) -> None:
        resp = await client.put(
            f"/api/v1/agents/{uuid.uuid4()}",
            json={"name": "Ghost"},
        )
        assert resp.status_code == 404

    async def test_delete_agent(self, client: AsyncClient) -> None:
        create_resp = await client.post(
            "/api/v1/agents",
            json={"name": "Doomed", "system_prompt": "Goodbye."},
        )
        agent_id = create_resp.json()["id"]
        resp = await client.delete(f"/api/v1/agents/{agent_id}")
        assert resp.status_code == 204
        resp = await client.get("/api/v1/agents")
        names = [a["name"] for a in resp.json()]
        assert "Doomed" not in names

    async def test_delete_agent_not_found(self, client: AsyncClient) -> None:
        resp = await client.delete(f"/api/v1/agents/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_delete_agent_blocked_by_council(self, client: AsyncClient, two_agents: list[str]) -> None:
        await client.post(
            "/api/v1/councils",
            json={"name": "Tight Council", "agent_ids": two_agents},
        )
        resp = await client.delete(f"/api/v1/agents/{two_agents[0]}")
        assert resp.status_code == 409

    async def test_delete_agent_cascade_from_council(self, client: AsyncClient) -> None:
        ids = []
        for name in ("A", "B", "C"):
            r = await client.post(
                "/api/v1/agents",
                json={"name": name, "system_prompt": f"I am {name}."},
            )
            ids.append(r.json()["id"])
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Big Council", "agent_ids": ids},
        )
        council_id = create_resp.json()["id"]
        resp = await client.delete(f"/api/v1/agents/{ids[0]}")
        assert resp.status_code == 204
        council_resp = await client.get(f"/api/v1/councils/{council_id}")
        assert len(council_resp.json()["agents"]) == 2


class TestCouncilEndpoints:
    async def test_create_council(self, client: AsyncClient, two_agents: list[str]) -> None:
        resp = await client.post(
            "/api/v1/councils",
            json={"name": "Test Council", "agent_ids": two_agents},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["name"] == "Test Council"
        assert len(body["agents"]) == 2

    async def test_create_council_invalid_agents(self, client: AsyncClient) -> None:
        fake_ids = [str(uuid.uuid4()), str(uuid.uuid4())]
        resp = await client.post(
            "/api/v1/councils",
            json={"name": "Ghost Council", "agent_ids": fake_ids},
        )
        assert resp.status_code == 404

    async def test_list_councils(self, client: AsyncClient, two_agents: list[str]) -> None:
        await client.post(
            "/api/v1/councils",
            json={"name": "Council X", "agent_ids": two_agents},
        )
        resp = await client.get("/api/v1/councils")
        assert resp.status_code == 200
        assert len(resp.json()) >= 1

    async def test_get_council(self, client: AsyncClient, two_agents: list[str]) -> None:
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Fetchable", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]
        resp = await client.get(f"/api/v1/councils/{council_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Fetchable"

    async def test_get_council_not_found(self, client: AsyncClient) -> None:
        resp = await client.get(f"/api/v1/councils/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_list_councils_pagination(self, client: AsyncClient, two_agents: list[str]) -> None:
        for i in range(3):
            await client.post(
                "/api/v1/councils",
                json={"name": f"Council {i}", "agent_ids": two_agents},
            )
        resp = await client.get("/api/v1/councils", params={"limit": 2})
        assert resp.status_code == 200
        assert len(resp.json()) == 2

        resp = await client.get("/api/v1/councils", params={"skip": 2})
        assert resp.status_code == 200
        assert len(resp.json()) == 1

    async def test_update_council_name(self, client: AsyncClient, two_agents: list[str]) -> None:
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Old Name", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]
        resp = await client.put(
            f"/api/v1/councils/{council_id}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"
        assert resp.json()["rounds"] == 3

    async def test_update_council_agents(self, client: AsyncClient) -> None:
        ids = []
        for name in ("X", "Y", "Z"):
            r = await client.post(
                "/api/v1/agents",
                json={"name": name, "system_prompt": f"I am {name}."},
            )
            ids.append(r.json()["id"])
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Swap Council", "agent_ids": ids[:2]},
        )
        council_id = create_resp.json()["id"]
        resp = await client.put(
            f"/api/v1/councils/{council_id}",
            json={"agent_ids": ids[1:]},
        )
        assert resp.status_code == 200
        agent_names = sorted(a["name"] for a in resp.json()["agents"])
        assert agent_names == ["Y", "Z"]

    async def test_update_council_not_found(self, client: AsyncClient) -> None:
        resp = await client.put(
            f"/api/v1/councils/{uuid.uuid4()}",
            json={"name": "Ghost"},
        )
        assert resp.status_code == 404

    async def test_update_council_invalid_agents(self, client: AsyncClient, two_agents: list[str]) -> None:
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Council", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]
        resp = await client.put(
            f"/api/v1/councils/{council_id}",
            json={"agent_ids": [str(uuid.uuid4()), str(uuid.uuid4())]},
        )
        assert resp.status_code == 404

    async def test_delete_council(self, client: AsyncClient, two_agents: list[str]) -> None:
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Deletable", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]
        resp = await client.delete(f"/api/v1/councils/{council_id}")
        assert resp.status_code == 204
        resp = await client.get(f"/api/v1/councils/{council_id}")
        assert resp.status_code == 404

    async def test_delete_council_not_found(self, client: AsyncClient) -> None:
        resp = await client.delete(f"/api/v1/councils/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_delete_council_blocked_by_active_session(self, client: AsyncClient, two_agents: list[str]) -> None:
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Active Council", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]
        await client.post(
            "/api/v1/sessions",
            json={"council_id": council_id, "input_claim": "Test claim"},
        )
        resp = await client.delete(f"/api/v1/councils/{council_id}")
        assert resp.status_code == 409
