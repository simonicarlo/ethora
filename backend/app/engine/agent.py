from __future__ import annotations

import logging
from typing import Any

import anthropic

from app.core.config import settings
from app.models.models import Agent

logger = logging.getLogger(__name__)

# Lazy singleton: avoids creating the client at import time, when the API key
# may not yet be loaded from .env (e.g. during test collection or module scanning).
_client: anthropic.AsyncAnthropic | None = None


def get_client() -> anthropic.AsyncAnthropic:
    global _client
    if _client is None:
        if not settings.ANTHROPIC_API_KEY:
            raise RuntimeError(
                "ANTHROPIC_API_KEY is not configured. "
                "Set it in the .env file or as an environment variable."
            )
        _client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)
    return _client


async def call_agent(
    agent: Agent,
    messages: list[dict[str, str]],
    system_prompt: str,
) -> str:
    """Calls Claude API for a single agent turn and returns the complete response."""
    try:
        client = get_client()
        response = await client.messages.create(
            model=agent.model,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
        )
    except anthropic.APIStatusError as exc:
        logger.error("Anthropic API error (%s): %s", exc.status_code, exc.message)
        raise RuntimeError(exc.message) from exc
    except anthropic.APIConnectionError as exc:
        logger.error("Anthropic API connection error: %s", exc)
        raise RuntimeError(
            "Unable to connect to the Anthropic API. Check your network connection."
        ) from exc
    # Claude API returns a list of content blocks; the first block is the text response.
    return response.content[0].text


async def call_with_tool(
    *,
    model: str,
    messages: list[dict[str, str]],
    system_prompt: str,
    tool: dict[str, Any],
) -> dict[str, Any]:
    """Call Claude API with a single tool, forcing it to use that tool.

    Returns the parsed tool input dict (guaranteed to match the tool schema).
    This eliminates fragile JSON parsing — the API guarantees structured output.
    """
    try:
        client = get_client()
        response = await client.messages.create(
            model=model,
            max_tokens=4096,
            system=system_prompt,
            messages=messages,
            tools=[tool],
            tool_choice={"type": "tool", "name": tool["name"]},
        )
    except anthropic.APIStatusError as exc:
        logger.error("Anthropic API error (%s): %s", exc.status_code, exc.message)
        raise RuntimeError(exc.message) from exc
    except anthropic.APIConnectionError as exc:
        logger.error("Anthropic API connection error: %s", exc)
        raise RuntimeError(
            "Unable to connect to the Anthropic API. Check your network connection."
        ) from exc

    # Extract the tool_use block from the response
    for block in response.content:
        if block.type == "tool_use":
            return block.input  # type: ignore[return-value]

    raise RuntimeError(
        f"Expected tool_use block in response but got: "
        f"{[b.type for b in response.content]}"
    )
