"""Moderator — LLM-powered session management role.

The moderator is not a council agent. It performs meta-tasks like deduplicating
candidate proposals. Designed for extensibility (round summaries, tie-breaking, etc.).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import TypedDict

from app.core.config import settings
from app.engine.agent import call_with_tool
from app.engine.prompts.loader import render_moderator_deduplicate, render_moderator_summarize, render_session_summary
from app.engine.tools import DEDUPLICATE_CANDIDATES_TOOL, SUMMARIZE_RESPONSE_TOOL, SUMMARIZE_SESSION_TOOL

logger = logging.getLogger(__name__)

MODERATOR_SYSTEM_PROMPT = "You are a neutral session moderator."


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
        parsed = await call_with_tool(
            model=settings.MODERATOR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            system_prompt=MODERATOR_SYSTEM_PROMPT,
            tool=DEDUPLICATE_CANDIDATES_TOOL,
        )
        return ModeratorResult(
            action="deduplicate_candidates",
            candidates=parsed["candidates"],
            explanation=parsed.get("explanation", ""),
        )
    except Exception:
        logger.warning("Moderator LLM call failed, falling back to exact-match dedup", exc_info=True)
        return _fallback_dedup(raw_candidates)


async def summarize_agent_response(
    agent_name: str,
    agent_response: str,
    input_claim: str,
) -> str | None:
    """Use the moderator LLM to produce a 1-2 sentence summary of an agent's response.

    Returns None on failure — the frontend falls back to showing full content.
    """
    prompt = render_moderator_summarize(
        input_claim=input_claim,
        agent_name=agent_name,
        agent_response=agent_response,
    )

    try:
        parsed = await call_with_tool(
            model=settings.MODERATOR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            system_prompt=MODERATOR_SYSTEM_PROMPT,
            tool=SUMMARIZE_RESPONSE_TOOL,
        )
        return parsed.get("summary")
    except Exception:
        logger.warning("Moderator summarization failed for agent %s", agent_name, exc_info=True)
        return None


async def summarize_session(
    input_claim: str,
    agent_summaries: list[tuple[str, str]],
) -> str | None:
    """Use the moderator LLM to produce a 2-3 sentence session-level summary.

    Args:
        input_claim: The original question/claim being deliberated.
        agent_summaries: List of (agent_name, summary) pairs from the final round.

    Returns None on failure — the session list falls back to showing no summary.
    """
    if not agent_summaries:
        return None

    summaries_text = "\n".join(
        f"- {name}: {summary}" for name, summary in agent_summaries
    )

    prompt = render_session_summary(
        input_claim=input_claim,
        agent_summaries=summaries_text,
    )

    try:
        parsed = await call_with_tool(
            model=settings.MODERATOR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            system_prompt=MODERATOR_SYSTEM_PROMPT,
            tool=SUMMARIZE_SESSION_TOOL,
        )
        return parsed.get("summary")
    except Exception:
        logger.warning("Session summarization failed", exc_info=True)
        return None


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
