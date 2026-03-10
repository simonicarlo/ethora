"""Tests for engine/voting.py — vote tallying mechanisms."""
from __future__ import annotations

import uuid

import pytest

from app.engine.voting import HumanVoteRequired, tally_votes
from app.models.models import Vote


def _make_vote(value: str, confidence: float | None = None) -> Vote:
    """Create a detached Vote object for testing (no DB session needed)."""
    return Vote(
        id=uuid.uuid4(),
        session_id=uuid.uuid4(),
        agent_id=uuid.uuid4(),
        value=value,
        confidence=confidence,
        reasoning=f"Voted {value}",
    )


# -- Empty votes --


async def test_tally_empty_votes() -> None:
    result = await tally_votes([], "majority")
    assert result["decision"] == "no_votes"
    assert result["confidence"] == 0.0


# -- Majority --


async def test_majority_unanimous() -> None:
    votes = [_make_vote("true", 0.9), _make_vote("true", 0.8), _make_vote("true", 0.7)]
    result = await tally_votes(votes, "majority")
    assert result["decision"] == "true"
    assert result["confidence"] == 1.0


async def test_majority_split() -> None:
    votes = [_make_vote("true"), _make_vote("false"), _make_vote("true")]
    result = await tally_votes(votes, "majority")
    assert result["decision"] == "true"
    assert result["confidence"] == pytest.approx(0.67, abs=0.01)


async def test_majority_single_vote() -> None:
    votes = [_make_vote("false")]
    result = await tally_votes(votes, "majority")
    assert result["decision"] == "false"
    assert result["confidence"] == 1.0


# -- Weighted --


async def test_weighted_high_confidence_wins() -> None:
    votes = [
        _make_vote("true", 0.9),
        _make_vote("false", 0.1),
        _make_vote("false", 0.1),
    ]
    result = await tally_votes(votes, "weighted")
    assert result["decision"] == "true"


async def test_weighted_none_confidence_defaults_to_one() -> None:
    votes = [_make_vote("true", None), _make_vote("false", 0.3)]
    result = await tally_votes(votes, "weighted")
    # true has weight 1.0, false has 0.3 → true wins
    assert result["decision"] == "true"


async def test_weighted_equal_weights() -> None:
    votes = [_make_vote("true", 0.5), _make_vote("false", 0.5)]
    result = await tally_votes(votes, "weighted")
    # Both have equal weight — either could win, just check it returns something valid
    assert result["decision"] in ("true", "false")
    assert result["confidence"] == 0.5


# -- Consensus --


async def test_consensus_all_agree() -> None:
    votes = [_make_vote("true", 0.8), _make_vote("true", 0.9), _make_vote("true", 0.7)]
    result = await tally_votes(votes, "consensus")
    assert result["decision"] == "true"
    assert result["confidence"] == 0.8  # avg of 0.8, 0.9, 0.7


async def test_consensus_disagreement() -> None:
    votes = [_make_vote("true", 0.9), _make_vote("false", 0.8)]
    result = await tally_votes(votes, "consensus")
    assert result["decision"] == "no_consensus"
    assert result["confidence"] == 0.0


async def test_consensus_no_confidence_values() -> None:
    votes = [_make_vote("true", None), _make_vote("true", None)]
    result = await tally_votes(votes, "consensus")
    assert result["decision"] == "true"
    assert result["confidence"] == 1.0  # fallback when no confidences


# -- Human in loop --


async def test_human_in_loop_raises() -> None:
    votes = [_make_vote("true", 0.9)]
    with pytest.raises(HumanVoteRequired):
        await tally_votes(votes, "human_in_loop")


# -- Unknown mechanism --


async def test_unknown_mechanism_raises() -> None:
    votes = [_make_vote("true")]
    with pytest.raises(ValueError, match="Unknown voting mechanism"):
        await tally_votes(votes, "unknown_thing")  # type: ignore[arg-type]
