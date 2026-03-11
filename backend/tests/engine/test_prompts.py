"""Tests for prompt template loader — pure logic, no DB or LLM."""
from __future__ import annotations

import pytest

from app.engine.prompts.loader import (
    load_template,
    render_continuation_nudge,
    render_deliberation_system,
    render_voting_prompt,
)


class TestLoadTemplate:
    def test_loads_existing_template(self) -> None:
        text = load_template("continuation_nudge.txt")
        assert "continue" in text.lower()

    def test_caches_template(self) -> None:
        t1 = load_template("continuation_nudge.txt")
        t2 = load_template("continuation_nudge.txt")
        assert t1 is t2  # same object = cached

    def test_nonexistent_template_raises(self) -> None:
        with pytest.raises(FileNotFoundError):
            load_template("nonexistent.txt")

    def test_path_traversal_rejected(self) -> None:
        with pytest.raises(ValueError, match="path separators"):
            load_template("../../core/config.py")


class TestRenderDeliberationSystem:
    def test_contains_all_context(self) -> None:
        result = render_deliberation_system(
            council_name="Ethics Board",
            agent_name="Critic",
            agent_list="Critic, Analyst, Synthesizer",
            voting_mechanism="majority",
            rounds=3,
            agent_system_prompt="You are a harsh critic.",
        )
        assert "Ethics Board" in result
        assert "Critic" in result
        assert "Analyst, Synthesizer" in result
        assert "majority" in result
        assert "3" in result
        assert "You are a harsh critic." in result

    def test_agent_prompt_preserved_verbatim(self) -> None:
        custom = "You are an expert in {domain} analysis."
        result = render_deliberation_system(
            council_name="Test",
            agent_name="Agent",
            agent_list="Agent",
            voting_mechanism="majority",
            rounds=1,
            agent_system_prompt=custom,
        )
        assert custom in result


class TestRenderVotingPrompt:
    def test_binary_contains_claim_and_debate(self) -> None:
        result = render_voting_prompt(
            input_claim="The sky is blue",
            debate_text="[Alice]: Yes it is.\n\n[Bob]: I agree.",
            question_type="binary",
        )
        assert "The sky is blue" in result
        assert "[Alice]:" in result
        assert "cast_vote" in result

    def test_open_with_candidates_section(self) -> None:
        result = render_voting_prompt(
            input_claim="Best color?",
            debate_text="[Alice]: Red.",
            question_type="open",
            candidates=["Red", "Blue"],
        )
        assert "Best color?" in result
        assert "Red" in result
        assert "Blue" in result
        assert "exactly as written" in result

    def test_debate_text_with_braces_preserved(self) -> None:
        result = render_voting_prompt(
            input_claim="claim",
            debate_text="[Alice]: The set {1, 2, 3} is finite.",
            question_type="binary",
        )
        assert "{1, 2, 3}" in result


class TestRenderContinuationNudge:
    def test_returns_nudge_text(self) -> None:
        result = render_continuation_nudge()
        assert "continue" in result.lower()
        assert len(result) > 10
