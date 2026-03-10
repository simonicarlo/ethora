from __future__ import annotations

from app.models.models import Agent


async def call_agent(agent: Agent, messages: list[dict[str, str]], system_prompt: str) -> str:
    """Calls Claude API for a single agent turn. TODO: implement."""
    raise NotImplementedError("Agent LLM calls not yet implemented")
