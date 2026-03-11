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
from app.engine.prompts.loader import render_moderator_deduplicate, render_moderator_summarize, render_research_synthesis, render_stage_set
from app.engine.tools import DEDUPLICATE_CANDIDATES_TOOL, SET_STAGE_TOOL, SUMMARIZE_RESPONSE_TOOL

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



async def synthesize_closing_statements(
    input_claim: str,
    statements: list[tuple[str, str]],
) -> str:
    """Use the moderator LLM to synthesize all closing statements into a cohesive summary.

    Args:
        input_claim: The original research topic.
        statements: List of (agent_name, statement) pairs.

    Returns:
        A synthesis string. Falls back to bullet-point concatenation on failure.
    """
    lines = [f"**{name}:** {stmt}" for name, stmt in statements]
    closing_text = "\n\n".join(lines)

    prompt = render_research_synthesis(
        input_claim=input_claim,
        closing_statements=closing_text,
    )

    try:
        parsed = await call_with_tool(
            model=settings.MODERATOR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            system_prompt=MODERATOR_SYSTEM_PROMPT,
            tool=SUMMARIZE_RESPONSE_TOOL,
        )
        return parsed.get("summary", "")
    except Exception:
        logger.warning("Moderator synthesis failed, falling back to concatenation", exc_info=True)
        fallback_lines = [f"- **{name}**: {stmt}" for name, stmt in statements]
        return "## Closing Statement Summary\n\n" + "\n\n".join(fallback_lines)


async def generate_stage_intro(
    *,
    council_name: str,
    input_claim: str,
    agent_descriptions: str,
    rounds: int,
    voting_mechanism: str,
) -> str | None:
    """Use the moderator LLM to generate a short stage-setting intro.

    Returns None on failure — the frontend renders the card without the intro text.
    """
    prompt = render_stage_set(
        council_name=council_name,
        input_claim=input_claim,
        agent_descriptions=agent_descriptions,
        rounds=rounds,
        voting_mechanism=voting_mechanism,
    )

    try:
        parsed = await call_with_tool(
            model=settings.MODERATOR_MODEL,
            messages=[{"role": "user", "content": prompt}],
            system_prompt=MODERATOR_SYSTEM_PROMPT,
            tool=SET_STAGE_TOOL,
        )
        return parsed.get("intro_text")
    except Exception:
        logger.warning("Stage intro generation failed", exc_info=True)
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
