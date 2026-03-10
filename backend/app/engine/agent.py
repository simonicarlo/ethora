from __future__ import annotations

import anthropic

from app.core.config import settings
from app.models.models import Agent

# Lazy singleton: avoids creating the client at import time, when the API key
# may not yet be loaded from .env (e.g. during test collection or module scanning).
_client: anthropic.AsyncAnthropic | None = None


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def call_agent(
    agent: Agent,
    messages: list[dict[str, str]],
    system_prompt: str,
) -> str:
    """Calls Claude API for a single agent turn and returns the complete response."""
    client = _get_client()
    response = await client.messages.create(
        model=agent.model,
        max_tokens=4096,
        system=system_prompt,
        messages=messages,
    )
    # Claude API returns a list of content blocks; the first block is the text response.
    return response.content[0].text
