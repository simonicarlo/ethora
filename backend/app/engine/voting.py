from __future__ import annotations

from collections import Counter
from typing import TypedDict

from app.models.models import Vote
from app.schemas.schemas import VotingMechanism


class TallyResult(TypedDict):
    decision: str
    confidence: float
    summary: str


class HumanVoteRequired(Exception):
    """Raised when human_in_loop voting needs a human decision."""


async def tally_votes(
    votes: list[Vote], mechanism: VotingMechanism
) -> TallyResult:
    """Routes to the correct voting mechanism and returns the result.

    Returns a dict with keys: decision (str), confidence (float), summary (str).
    """
    if not votes:
        return {"decision": "no_votes", "confidence": 0.0, "summary": "No votes cast"}

    if mechanism == "majority":
        return _majority(votes)
    if mechanism == "weighted":
        return _weighted(votes)
    if mechanism == "consensus":
        return _consensus(votes)
    if mechanism == "human_in_loop":
        raise HumanVoteRequired("Waiting for human to cast deciding vote")
    raise ValueError(f"Unknown voting mechanism: {mechanism}")


def _majority(votes: list[Vote]) -> TallyResult:
    counts = Counter(v.value for v in votes)
    winner, winner_count = counts.most_common(1)[0]
    total = len(votes)
    return {
        "decision": winner,
        "confidence": round(winner_count / total, 2),
        "summary": f"{winner_count} of {total} agents voted '{winner}'",
    }


def _weighted(votes: list[Vote]) -> TallyResult:
    weights: dict[str, float] = {}
    for v in votes:
        # Default to 1.0 so agents without a confidence score are counted equally
        # rather than silently ignored (which would skew results).
        w = v.confidence if v.confidence is not None else 1.0
        weights[v.value] = weights.get(v.value, 0.0) + w

    total_weight = sum(weights.values())
    winner = max(weights, key=lambda k: weights[k])
    winner_weight = weights[winner]

    return {
        "decision": winner,
        "confidence": round(winner_weight / total_weight, 2) if total_weight else 0.0,
        "summary": (
            f"Weighted tally: "
            + ", ".join(f"'{k}': {w:.2f}" for k, w in weights.items())
        ),
    }


def _consensus(votes: list[Vote]) -> TallyResult:
    values = {v.value for v in votes}
    if len(values) == 1:
        decision = values.pop()
        confidences = [v.confidence for v in votes if v.confidence is not None]
        avg_confidence = (
            round(sum(confidences) / len(confidences), 2) if confidences else 1.0
        )
        return {
            "decision": decision,
            "confidence": avg_confidence,
            "summary": f"All {len(votes)} agents reached consensus on '{decision}'",
        }
    # Deliberately returns no_consensus rather than falling back to majority.
    # Consensus means unanimity — partial agreement is not consensus by design.
    return {
        "decision": "no_consensus",
        "confidence": 0.0,
        "summary": f"No consensus — agents split across: {', '.join(sorted(values))}",
    }
