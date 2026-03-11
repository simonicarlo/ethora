"""Moderator — LLM-powered session management role.

The moderator is not a council agent. It performs meta-tasks like deduplicating
candidate proposals. Designed for extensibility (round summaries, tie-breaking, etc.).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import TypedDict

from app.core.config import settings
from app.engine.agent import get_client
from app.engine.prompts.loader import render_moderator_deduplicate

logger = logging.getLogger(__name__)


class CandidateEntry(TypedDict):
    agent_id: str
    agent_name: str
    candidates: list[str]


@dataclass
class ModeratorResult:
    action: str
    candidates: list[str]
    explanation: str


async def deduplicate_candidates(
    raw_candidates: list[CandidateEntry],
    input_claim: str,
) -> ModeratorResult:
    """Use the moderator LLM to merge semantically equivalent candidates.

    Falls back to case-insensitive exact-match dedup if the LLM response
    cannot be parsed — the session must never fail because the moderator failed.
    """
    # Format raw candidates for the prompt
    lines: list[str] = []
    for entry in raw_candidates:
        agent_name = entry["agent_name"]
        for candidate in entry["candidates"]:
            lines.append(f"- {agent_name}: {candidate}")
    raw_text = "\n".join(lines)

    prompt = render_moderator_deduplicate(
        input_claim=input_claim,
        raw_candidates=raw_text,
    )

    try:
        client = get_client()
        response = await client.messages.create(
            model=settings.MODERATOR_MODEL,
            max_tokens=2048,
            system="You are a neutral session moderator. Respond only with the requested JSON.",
            messages=[{"role": "user", "content": prompt}],
        )
        raw_response = response.content[0].text
        parsed = _parse_moderator_response(raw_response)
        return ModeratorResult(
            action="deduplicate_candidates",
            candidates=parsed["candidates"],
            explanation=parsed.get("explanation", ""),
        )
    except Exception:
        logger.warning("Moderator LLM call failed, falling back to exact-match dedup", exc_info=True)
        return _fallback_dedup(raw_candidates)


def _parse_moderator_response(raw_text: str) -> dict[str, str | list[str]]:
    """Extract and validate JSON from moderator response."""
    text = raw_text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        parsed = json.loads(text[start:end + 1])
        candidates = parsed.get("candidates", [])
        if not isinstance(candidates, list) or not all(isinstance(c, str) for c in candidates):
            raise ValueError(
                f"Moderator response 'candidates' is not a list of strings: {type(candidates)}"
            )
        return parsed
    raise ValueError(f"No JSON found in moderator response: {text[:200]}")


def _fallback_dedup(raw_candidates: list[CandidateEntry]) -> ModeratorResult:
    """Case-insensitive exact-match deduplication as fallback."""
    seen: dict[str, str] = {}
    for entry in raw_candidates:
        for candidate in entry["candidates"]:
            key = candidate.strip().lower()
            if key not in seen:
                seen[key] = candidate.strip()

    return ModeratorResult(
        action="deduplicate_candidates",
        candidates=list(seen.values()),
        explanation="Fallback: exact-match deduplication (moderator LLM unavailable)",
    )
