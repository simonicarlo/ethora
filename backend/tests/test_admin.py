"""Tests for admin endpoints: stats, settings, error logs."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.models import Agent, Council, Message, Round, Session, Verdict, Vote


async def _seed_data(db: AsyncSession) -> dict[str, str]:
    """Seed agents, councils, sessions with messages/votes/verdicts. Returns IDs."""
    agent_a = Agent(name="Agent A", system_prompt="You are A.")
    agent_b = Agent(name="Agent B", system_prompt="You are B.")
    db.add_all([agent_a, agent_b])
    await db.flush()

    council = Council(name="Test Council", rounds=2, agents=[agent_a, agent_b])
    db.add(council)
    await db.flush()

    # Completed session
    session_ok = Session(
        council_id=council.id,
        input_claim="Is the sky blue?",
        status="complete",
        created_at=datetime.now(timezone.utc),
    )
    db.add(session_ok)
    await db.flush()

    round_1 = Round(session_id=session_ok.id, round_number=1)
    db.add(round_1)
    await db.flush()

    msg_a = Message(round_id=round_1.id, agent_id=agent_a.id, content="Yes it is blue.")
    msg_b = Message(round_id=round_1.id, agent_id=agent_b.id, content="I agree, the sky is blue on clear days.")
    db.add_all([msg_a, msg_b])

    vote_a = Vote(session_id=session_ok.id, agent_id=agent_a.id, value="true", confidence=0.9)
    vote_b = Vote(session_id=session_ok.id, agent_id=agent_b.id, value="true", confidence=0.85)
    db.add_all([vote_a, vote_b])

    verdict = Verdict(
        session_id=session_ok.id,
        decision="true",
        confidence=0.9,
        summary="The sky is blue.",
    )
    db.add(verdict)

    # Error session
    session_err = Session(
        council_id=council.id,
        input_claim="Will this fail?",
        status="error",
        created_at=datetime.now(timezone.utc),
    )
    db.add(session_err)

    # Pending session
    session_pending = Session(
        council_id=council.id,
        input_claim="Is water wet?",
        status="pending",
    )
    db.add(session_pending)

    await db.flush()

    return {
        "agent_a_id": str(agent_a.id),
        "agent_b_id": str(agent_b.id),
        "council_id": str(council.id),
        "session_ok_id": str(session_ok.id),
        "session_err_id": str(session_err.id),
    }


@pytest.fixture()
async def seeded(db_session: AsyncSession) -> dict[str, str]:
    return await _seed_data(db_session)


class TestSessionStats:
    async def test_session_stats(self, client: AsyncClient, seeded: dict[str, str]) -> None:
        resp = await client.get("/api/v1/admin/stats/sessions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_sessions"] == 3
        assert data["sessions_by_status"]["complete"] == 1
        assert data["sessions_by_status"]["error"] == 1
        assert data["completion_rate"] > 0
        assert isinstance(data["avg_rounds_per_session"], float)
        assert isinstance(data["sessions_over_time"], list)

    async def test_session_stats_empty(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/admin/stats/sessions")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_sessions"] == 0
        assert data["completion_rate"] == 0.0


class TestCouncilStats:
    async def test_council_stats(self, client: AsyncClient, seeded: dict[str, str]) -> None:
        resp = await client.get("/api/v1/admin/stats/councils")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["council_usage"]) >= 1
        item = data["council_usage"][0]
        assert item["council_name"] == "Test Council"
        assert item["session_count"] == 3
        assert isinstance(item["avg_deliberation_seconds"], float)


class TestAgentStats:
    async def test_agent_stats(self, client: AsyncClient, seeded: dict[str, str]) -> None:
        resp = await client.get("/api/v1/admin/stats/agents")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["agent_metrics"]) >= 2
        names = {m["agent_name"] for m in data["agent_metrics"]}
        assert "Agent A" in names
        for metric in data["agent_metrics"]:
            assert isinstance(metric["message_count"], int)
            assert isinstance(metric["avg_message_length"], float)
            assert isinstance(metric["voting_alignment"], float)


class TestErrorLogs:
    async def test_error_logs(self, client: AsyncClient, seeded: dict[str, str]) -> None:
        resp = await client.get("/api/v1/admin/logs/errors")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) == 1
        assert data[0]["session_id"] == seeded["session_err_id"]
        assert data[0]["council_name"] == "Test Council"

    async def test_error_logs_empty(self, client: AsyncClient) -> None:
        resp = await client.get("/api/v1/admin/logs/errors")
        assert resp.status_code == 200
        assert resp.json() == []


class TestSettings:
    async def test_create_and_list_settings(self, client: AsyncClient) -> None:
        resp = await client.put(
            "/api/v1/admin/settings/moderator_model",
            json={"value": "claude-sonnet-4-20250514"},
        )
        assert resp.status_code == 200
        assert resp.json()["key"] == "moderator_model"
        assert resp.json()["value"] == "claude-sonnet-4-20250514"

        resp = await client.get("/api/v1/admin/settings")
        assert resp.status_code == 200
        keys = [s["key"] for s in resp.json()]
        assert "moderator_model" in keys

    async def test_update_setting(self, client: AsyncClient) -> None:
        await client.put("/api/v1/admin/settings/cors_origins", json={"value": "v1"})
        resp = await client.put("/api/v1/admin/settings/cors_origins", json={"value": "v2"})
        assert resp.status_code == 200
        assert resp.json()["value"] == "v2"

    async def test_sensitive_key_masked(self, client: AsyncClient) -> None:
        await client.put(
            "/api/v1/admin/settings/anthropic_api_key",
            json={"value": "sk-ant-secret-key"},
        )
        resp = await client.get("/api/v1/admin/settings")
        assert resp.status_code == 200
        api_key_setting = next(s for s in resp.json() if s["key"] == "anthropic_api_key")
        # Masking shows last 4 chars: "****-key"
        assert api_key_setting["value"].startswith("****")
        assert api_key_setting["value"] == "****-key"
        assert "secret" not in api_key_setting["value"]

    async def test_delete_setting(self, client: AsyncClient) -> None:
        await client.put("/api/v1/admin/settings/cors_origins", json={"value": "bye"})
        resp = await client.delete("/api/v1/admin/settings/cors_origins")
        assert resp.status_code == 204

        resp = await client.get("/api/v1/admin/settings")
        keys = [s["key"] for s in resp.json()]
        assert "cors_origins" not in keys

    async def test_delete_setting_not_found(self, client: AsyncClient) -> None:
        resp = await client.delete("/api/v1/admin/settings/moderator_model")
        assert resp.status_code == 404

    async def test_unknown_key_rejected(self, client: AsyncClient) -> None:
        resp = await client.put(
            "/api/v1/admin/settings/arbitrary_key",
            json={"value": "should_fail"},
        )
        assert resp.status_code == 400
        assert "Unknown setting key" in resp.json()["detail"]


class TestAdminAuth:
    """Test X-Admin-Key header authentication for admin endpoints."""

    async def test_rejects_when_key_required_but_missing(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "ADMIN_API_KEY", "test-admin-secret")
        resp = await client.get("/api/v1/admin/stats/sessions")
        assert resp.status_code == 403
        assert "admin API key" in resp.json()["detail"]

    async def test_rejects_wrong_key(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "ADMIN_API_KEY", "correct-key")
        resp = await client.get(
            "/api/v1/admin/stats/sessions",
            headers={"X-Admin-Key": "wrong-key"},
        )
        assert resp.status_code == 403

    async def test_accepts_correct_key(
        self, client: AsyncClient, monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        monkeypatch.setattr(settings, "ADMIN_API_KEY", "correct-key")
        resp = await client.get(
            "/api/v1/admin/stats/sessions",
            headers={"X-Admin-Key": "correct-key"},
        )
        assert resp.status_code == 200

    async def test_open_when_no_key_configured(self, client: AsyncClient) -> None:
        """Default: ADMIN_API_KEY is empty — no header needed (dev mode)."""
        resp = await client.get("/api/v1/admin/stats/sessions")
        assert resp.status_code == 200
