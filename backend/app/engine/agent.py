from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import anthropic

from app.core.config import settings
from app.models.models import Agent

logger = logging.getLogger(__name__)


class RateLimitError(Exception):
    """Raised when the Anthropic API returns a 429 rate-limit response."""

    def __init__(self, message: str, retry_after: float | None = None) -> None:
        super().__init__(message)
        self.retry_after = retry_after


@dataclass
class Reference:
    """A source reference extracted from tool results (e.g., web search)."""

    url: str
    title: str | None = None
    snippet: str | None = None

    def to_dict(self) -> dict[str, str | None]:
        return {"url": self.url, "title": self.title, "snippet": self.snippet}


@dataclass
class ToolInvocation:
    """Record of a tool the agent invoked during its turn."""

    tool_name: str
    tool_input: dict[str, Any]


@dataclass
class AgentResponse:
    """Full response from an agent call, including tool-use metadata."""

    content: str
    references: list[Reference] = field(default_factory=list)
    tool_invocations: list[ToolInvocation] = field(default_factory=list)

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
    tools: list[dict[str, Any]] | None = None,
) -> AgentResponse:
    """Calls Claude API for a single agent turn and returns the complete response.

    When tools are provided (e.g., web_search), the API may execute them server-side.
    References and tool invocations are extracted from the response content blocks.
    """
    try:
        client = get_client()
        kwargs: dict[str, Any] = {
            "model": agent.model,
            "max_tokens": 4096,
            "system": system_prompt,
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        response = await client.messages.create(**kwargs)
    except anthropic.RateLimitError as exc:
        retry_after = _extract_retry_after(exc)
        logger.warning("Rate limited by Anthropic API (retry_after=%s): %s", retry_after, exc.message)
        raise RateLimitError(exc.message, retry_after=retry_after) from exc
    except anthropic.APIStatusError as exc:
        logger.error("Anthropic API error (%s): %s", exc.status_code, exc.message)
        raise RuntimeError(exc.message) from exc
    except anthropic.APIConnectionError as exc:
        logger.error("Anthropic API connection error: %s", exc)
        raise RuntimeError(
            "Unable to connect to the Anthropic API. Check your network connection."
        ) from exc

    return _parse_agent_response(response)


def _parse_agent_response(response: anthropic.types.Message) -> AgentResponse:
    """Extract text content, references, and tool invocations from a Claude response.

    Handles:
    - TextBlock → concatenated into content
    - ToolUseBlock → recorded as tool invocations (e.g., web_search queries)
    - ServerToolResult with web_search_results → extracted as references
    """
    text_parts: list[str] = []
    references: list[Reference] = []
    tool_invocations: list[ToolInvocation] = []

    for block in response.content:
        if block.type == "text":
            text_parts.append(block.text)
        elif block.type == "tool_use":
            # SDK types `input` as `object`, but it's always a dict for our tool schemas
            tool_invocations.append(
                ToolInvocation(tool_name=block.name, tool_input=block.input)  # type: ignore[arg-type]
            )
        elif block.type == "web_search_tool_result":
            # Server-side web search results contain search entries.
            # SDK union type doesn't narrow `.content` — access defensively.
            try:
                for entry in block.content:  # type: ignore[union-attr]
                    if getattr(entry, "type", None) == "web_search_result":
                        references.append(
                            Reference(
                                url=getattr(entry, "url", ""),
                                title=getattr(entry, "title", None),
                                snippet=getattr(entry, "page_snippet", None),
                            )
                        )
            except (AttributeError, TypeError):
                logger.warning("Unexpected web_search_tool_result structure, skipping references")

    content = "\n\n".join(text_parts) if text_parts else ""
    return AgentResponse(
        content=content,
        references=references,
        tool_invocations=tool_invocations,
    )


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
    except anthropic.RateLimitError as exc:
        retry_after = _extract_retry_after(exc)
        logger.warning("Rate limited by Anthropic API (retry_after=%s): %s", retry_after, exc.message)
        raise RateLimitError(exc.message, retry_after=retry_after) from exc
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


def _extract_retry_after(exc: anthropic.RateLimitError) -> float | None:
    """Extract Retry-After seconds from a rate-limit response, if present.

    Checks the standard ``Retry-After`` header first, then falls back to
    ``x-ratelimit-reset`` (Unix timestamp) which some providers use.
    """
    try:
        headers = exc.response.headers
        header = headers.get("retry-after")
        if header is not None:
            return float(header)
        # Fallback: x-ratelimit-reset is a Unix timestamp
        reset_ts = headers.get("x-ratelimit-reset")
        if reset_ts is not None:
            import time
            return max(0.0, float(reset_ts) - time.time())
    except (AttributeError, ValueError):
        pass
    return None
