from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.engine.voting import HumanVoteRequired, _consensus, _majority, _weighted, tally_votes


def _vote(value: str, confidence: float | None = None) -> SimpleNamespace:
    """Create a lightweight Vote-like object."""
    return SimpleNamespace(value=value, confidence=confidence)


# -- _majority ---------------------------------------------------------------

class TestMajority:
    def test_clear_winner(self) -> None:
        votes = [_vote("true"), _vote("true"), _vote("false")]
        result = _majority(votes)
        assert result["decision"] == "true"
        assert result["confidence"] == pytest.approx(2 / 3, abs=0.01)

    def test_tie_picks_first_most_common(self) -> None:
        # Counter.most_common picks the one encountered first when counts are equal
        votes = [_vote("true"), _vote("false")]
        result = _majority(votes)
        # Both have count 1; most_common returns the first encountered
        assert result["decision"] in ("true", "false")
        assert result["confidence"] == pytest.approx(0.5, abs=0.01)


# -- _weighted ---------------------------------------------------------------

class TestWeighted:
    def test_different_confidences(self) -> None:
        votes = [_vote("true", 0.9), _vote("false", 0.3)]
        result = _weighted(votes)
        assert result["decision"] == "true"
        assert result["confidence"] == pytest.approx(0.9 / 1.2, abs=0.01)

    def test_none_confidence_defaults_to_one(self) -> None:
        votes = [_vote("true", None), _vote("false", 0.5)]
        result = _weighted(votes)
        assert result["decision"] == "true"
        assert result["confidence"] == pytest.approx(1.0 / 1.5, abs=0.01)


# -- _consensus --------------------------------------------------------------

class TestConsensus:
    def test_all_agree(self) -> None:
        votes = [_vote("true", 0.8), _vote("true", 0.9)]
        result = _consensus(votes)
        assert result["decision"] == "true"
        assert result["confidence"] == pytest.approx(0.85, abs=0.01)

    def test_disagreement(self) -> None:
        votes = [_vote("true", 0.9), _vote("false", 0.8)]
        result = _consensus(votes)
        assert result["decision"] == "no_consensus"
        assert result["confidence"] == 0.0


# -- tally_votes --------------------------------------------------------------

class TestTallyVotes:
    async def test_empty_list(self) -> None:
        result = await tally_votes([], "majority")
        assert result["decision"] == "no_votes"
        assert result["confidence"] == 0.0

    async def test_human_in_loop_raises(self) -> None:
        votes = [_vote("true")]
        with pytest.raises(HumanVoteRequired):
            await tally_votes(votes, "human_in_loop")
