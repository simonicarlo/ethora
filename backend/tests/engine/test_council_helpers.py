"""Tests for council.py helper functions — pure logic, no DB or LLM calls."""
from __future__ import annotations

import json
import uuid

import pytest

from app.engine.council import _build_agent_messages, _parse_vote
from app.models.models import Agent


def _make_agent(name: str = "Agent A") -> Agent:
    """Create a detached Agent object for testing."""
    return Agent(
        id=uuid.uuid4(),
        name=name,
        system_prompt="You are a test agent.",
        model="claude-sonnet-4-20250514",
    )


# -- _build_agent_messages --


class TestBuildAgentMessages:
    def test_empty_history(self) -> None:
        agent = _make_agent()
        msgs = _build_agent_messages([], agent, "Is the sky blue?")
        assert len(msgs) == 1
        assert msgs[0]["role"] == "user"
        assert "Is the sky blue?" in msgs[0]["content"]

    def test_own_messages_become_assistant(self) -> None:
        agent = _make_agent("Alice")
        history = [(agent.name, agent.id, "I think yes.")]
        msgs = _build_agent_messages(history, agent, "claim")
        roles = [m["role"] for m in msgs]
        assert "assistant" in roles

    def test_other_messages_become_user(self) -> None:
        agent_a = _make_agent("Alice")
        agent_b = _make_agent("Bob")
        history = [(agent_b.name, agent_b.id, "I disagree.")]
        msgs = _build_agent_messages(history, agent_a, "claim")
        # First is the claim (user), second is Bob's message (user) — should merge
        assert len(msgs) == 1
        assert "[Bob]: I disagree." in msgs[0]["content"]

    def test_alternation_merges_consecutive_same_role(self) -> None:
        agent_a = _make_agent("Alice")
        agent_b = _make_agent("Bob")
        agent_c = _make_agent("Charlie")
        # Two other agents in a row → both user role → merged
        history = [
            (agent_b.name, agent_b.id, "Point from Bob."),
            (agent_c.name, agent_c.id, "Point from Charlie."),
        ]
        msgs = _build_agent_messages(history, agent_a, "claim")
        # claim + Bob + Charlie all user → merged into 1
        assert len(msgs) == 1
        assert "[Bob]:" in msgs[0]["content"]
        assert "[Charlie]:" in msgs[0]["content"]

    def test_alternating_roles_not_merged(self) -> None:
        agent_a = _make_agent("Alice")
        agent_b = _make_agent("Bob")
        history = [
            (agent_a.name, agent_a.id, "My first point."),
            (agent_b.name, agent_b.id, "I counter that."),
            (agent_a.name, agent_a.id, "My rebuttal."),
        ]
        msgs = _build_agent_messages(history, agent_a, "claim")
        roles = [m["role"] for m in msgs]
        # user (claim), assistant (Alice), user (Bob), assistant (Alice), user (nudge)
        assert roles == ["user", "assistant", "user", "assistant", "user"]

    def test_continuation_nudge_added_when_last_is_assistant(self) -> None:
        agent_a = _make_agent("Alice")
        history = [(agent_a.name, agent_a.id, "My point.")]
        msgs = _build_agent_messages(history, agent_a, "claim")
        assert msgs[-1]["role"] == "user"
        assert "continue" in msgs[-1]["content"].lower()

    def test_no_nudge_when_last_is_user(self) -> None:
        agent_a = _make_agent("Alice")
        agent_b = _make_agent("Bob")
        history = [(agent_b.name, agent_b.id, "Bob's point.")]
        msgs = _build_agent_messages(history, agent_a, "claim")
        # Last message is user (Bob's), no nudge needed
        assert "continue" not in msgs[-1]["content"].lower()

    def test_messages_always_start_with_user(self) -> None:
        agent = _make_agent()
        for history in [
            [],
            [(agent.name, agent.id, "something")],
        ]:
            msgs = _build_agent_messages(history, agent, "claim")
            assert msgs[0]["role"] == "user"

    def test_no_consecutive_same_role_in_output(self) -> None:
        """Verifies the Claude API alternation constraint is satisfied."""
        agent_a = _make_agent("Alice")
        agent_b = _make_agent("Bob")
        agent_c = _make_agent("Charlie")
        # Complex history: mixed agents
        history = [
            (agent_b.name, agent_b.id, "Bob 1"),
            (agent_c.name, agent_c.id, "Charlie 1"),
            (agent_a.name, agent_a.id, "Alice 1"),
            (agent_b.name, agent_b.id, "Bob 2"),
            (agent_a.name, agent_a.id, "Alice 2"),
        ]
        msgs = _build_agent_messages(history, agent_a, "claim")
        for i in range(1, len(msgs)):
            assert msgs[i]["role"] != msgs[i - 1]["role"], (
                f"Consecutive same role at index {i}: {msgs[i-1]['role']}"
            )


# -- _parse_vote --


class TestParseVote:
    def test_clean_json(self) -> None:
        raw = '{"value": "true", "confidence": 0.85, "reasoning": "evidence strong"}'
        result = _parse_vote(raw)
        assert result["value"] == "true"
        assert result["confidence"] == 0.85
        assert result["reasoning"] == "evidence strong"

    def test_json_with_surrounding_text(self) -> None:
        raw = 'Here is my vote:\n{"value": "false", "confidence": 0.6, "reasoning": "weak"}\nThank you.'
        result = _parse_vote(raw)
        assert result["value"] == "false"
        assert result["confidence"] == 0.6

    def test_json_in_markdown_code_block(self) -> None:
        raw = '```json\n{"value": "true", "confidence": 0.9, "reasoning": "solid"}\n```'
        result = _parse_vote(raw)
        assert result["value"] == "true"

    def test_invalid_json_falls_back(self) -> None:
        raw = "I vote true with high confidence"
        result = _parse_vote(raw)
        assert result["value"] == "abstain"
        assert result["confidence"] == 0.0
        assert result["reasoning"] == raw

    def test_empty_string_falls_back(self) -> None:
        result = _parse_vote("")
        assert result["value"] == "abstain"

    def test_malformed_json_falls_back(self) -> None:
        raw = '{value: true, confidence: high}'
        result = _parse_vote(raw)
        assert result["value"] == "abstain"
        assert result["reasoning"] == raw

    def test_nested_braces(self) -> None:
        raw = '{"value": "true", "confidence": 0.7, "reasoning": "because {reasons}"}'
        result = _parse_vote(raw)
        assert result["value"] == "true"

    def test_whitespace_handling(self) -> None:
        raw = '   \n  {"value": "false", "confidence": 0.5, "reasoning": "unsure"}  \n  '
        result = _parse_vote(raw)
        assert result["value"] == "false"


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
