from __future__ import annotations

import uuid

import pytest
from pydantic import ValidationError

from app.schemas.schemas import AgentCreate, CouncilCreate, HumanVoteRequest


class TestAgentCreate:
    def test_valid(self) -> None:
        agent = AgentCreate(name="Analyst", system_prompt="You are an analyst.")
        assert agent.name == "Analyst"
        assert agent.model == "claude-sonnet-4-20250514"

    def test_empty_name_fails(self) -> None:
        with pytest.raises(ValidationError):
            AgentCreate(name="", system_prompt="prompt")

    def test_empty_system_prompt_fails(self) -> None:
        with pytest.raises(ValidationError):
            AgentCreate(name="Bot", system_prompt="")


class TestCouncilCreate:
    def test_valid(self) -> None:
        ids = [uuid.uuid4(), uuid.uuid4()]
        council = CouncilCreate(name="Test Council", agent_ids=ids)
        assert council.rounds == 3
        assert council.voting_mechanism == "majority"

    def test_min_two_agents(self) -> None:
        with pytest.raises(ValidationError):
            CouncilCreate(name="Solo", agent_ids=[uuid.uuid4()])

    def test_rounds_lower_bound(self) -> None:
        with pytest.raises(ValidationError):
            CouncilCreate(name="Bad", agent_ids=[uuid.uuid4(), uuid.uuid4()], rounds=0)

    def test_rounds_upper_bound(self) -> None:
        with pytest.raises(ValidationError):
            CouncilCreate(name="Bad", agent_ids=[uuid.uuid4(), uuid.uuid4()], rounds=21)


class TestHumanVoteRequest:
    def test_valid(self) -> None:
        vote = HumanVoteRequest(decision="true", confidence=0.85, reasoning="Looks right")
        assert vote.confidence == 0.85

    def test_confidence_too_low(self) -> None:
        with pytest.raises(ValidationError):
            HumanVoteRequest(decision="true", confidence=-0.1)

    def test_confidence_too_high(self) -> None:
        with pytest.raises(ValidationError):
            HumanVoteRequest(decision="true", confidence=1.1)
