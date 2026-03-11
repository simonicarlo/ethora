"""Tests for engine/moderator.py — stage intro generation (mocked LLM)."""
from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.engine.moderator import generate_stage_intro


@pytest.mark.asyncio
class TestGenerateStageIntro:
    async def test_returns_intro_text_on_success(self) -> None:
        with patch("app.engine.moderator.call_with_tool", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = {"intro_text": "Welcome to this deliberation."}
            result = await generate_stage_intro(
                council_name="Ethics Board",
                input_claim="Is AI ethical?",
                agent_descriptions="- Critic: Harsh critic",
                rounds=3,
                voting_mechanism="weighted",
            )
            assert result == "Welcome to this deliberation."
            mock_call.assert_called_once()

    async def test_returns_none_on_failure(self) -> None:
        with patch("app.engine.moderator.call_with_tool", new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = RuntimeError("LLM unavailable")
            result = await generate_stage_intro(
                council_name="Test",
                input_claim="claim",
                agent_descriptions="- Agent: Test",
                rounds=1,
                voting_mechanism="majority",
            )
            assert result is None
