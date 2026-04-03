"""Tests for app/engine/agent.py — LLM client wrapper."""
from __future__ import annotations

import time
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import anthropic
import pytest

import app.engine.agent as agent_module
from app.engine.agent import (
    AgentResponse,
    RateLimitError,
    Reference,
    ToolInvocation,
    _extract_retry_after,
    _parse_agent_response,
    call_agent,
    call_with_tool,
    get_client,
    reset_client,
)
from app.models.models import Agent


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_agent(model: str = "claude-sonnet-4-20250514") -> Agent:
    """Return a lightweight Agent instance (no DB session required)."""
    a = Agent.__new__(Agent)
    a.id = "agent-1"
    a.name = "Test Agent"
    a.model = model
    a.system_prompt = "You are a test agent."
    a.icon = "smart_toy"
    return a


def _text_block(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use_block(name: str, input_data: dict[str, Any]) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=input_data)


def _web_search_result_entry(url: str, title: str, snippet: str) -> SimpleNamespace:
    return SimpleNamespace(type="web_search_result", url=url, title=title, page_snippet=snippet)


def _web_search_result_block(entries: list[Any]) -> SimpleNamespace:
    return SimpleNamespace(type="web_search_tool_result", content=entries)


def _make_response(content_blocks: list[Any]) -> SimpleNamespace:
    return SimpleNamespace(content=content_blocks)


def _make_rate_limit_exc(
    retry_after: str | None = None,
    reset_ts: str | None = None,
) -> MagicMock:
    """Create a mock anthropic.RateLimitError with the given headers."""
    headers: dict[str, str] = {}
    if retry_after is not None:
        headers["retry-after"] = retry_after
    if reset_ts is not None:
        headers["x-ratelimit-reset"] = reset_ts
    exc = MagicMock(spec=anthropic.RateLimitError)
    exc.response = SimpleNamespace(headers=headers)
    exc.message = "Rate limit exceeded"
    return exc


# ---------------------------------------------------------------------------
# RateLimitError
# ---------------------------------------------------------------------------


def test_rate_limit_error_stores_retry_after() -> None:
    err = RateLimitError("Too many requests", retry_after=30.0)
    assert err.retry_after == 30.0
    assert str(err) == "Too many requests"


def test_rate_limit_error_retry_after_defaults_to_none() -> None:
    err = RateLimitError("Too many requests")
    assert err.retry_after is None


def test_rate_limit_error_is_exception() -> None:
    with pytest.raises(RateLimitError):
        raise RateLimitError("Boom")


# ---------------------------------------------------------------------------
# Reference
# ---------------------------------------------------------------------------


def test_reference_to_dict() -> None:
    ref = Reference(url="https://example.com", title="Example", snippet="A snippet")
    d = ref.to_dict()
    assert d == {"url": "https://example.com", "title": "Example", "snippet": "A snippet"}


def test_reference_optional_fields_default_none() -> None:
    ref = Reference(url="https://example.com")
    assert ref.title is None
    assert ref.snippet is None


def test_reference_to_dict_with_none_fields() -> None:
    ref = Reference(url="https://example.com")
    d = ref.to_dict()
    assert d["title"] is None
    assert d["snippet"] is None


# ---------------------------------------------------------------------------
# ToolInvocation
# ---------------------------------------------------------------------------


def test_tool_invocation_stores_name_and_input() -> None:
    ti = ToolInvocation(tool_name="web_search", tool_input={"query": "climate change"})
    assert ti.tool_name == "web_search"
    assert ti.tool_input == {"query": "climate change"}


# ---------------------------------------------------------------------------
# AgentResponse
# ---------------------------------------------------------------------------


def test_agent_response_default_empty_lists() -> None:
    resp = AgentResponse(content="Hello")
    assert resp.content == "Hello"
    assert resp.references == []
    assert resp.tool_invocations == []


def test_agent_response_with_data() -> None:
    refs = [Reference(url="https://a.com")]
    invs = [ToolInvocation("search", {"q": "x"})]
    resp = AgentResponse(content="Hi", references=refs, tool_invocations=invs)
    assert resp.references is refs
    assert resp.tool_invocations is invs


# ---------------------------------------------------------------------------
# get_client / reset_client
# ---------------------------------------------------------------------------


def test_reset_client_clears_cached_client() -> None:
    reset_client()
    assert agent_module._client is None
    assert agent_module._client_key is None


def test_get_client_raises_when_api_key_is_empty() -> None:
    reset_client()
    with patch.object(agent_module.settings, "ANTHROPIC_API_KEY", ""):
        with pytest.raises(RuntimeError, match="ANTHROPIC_API_KEY is not configured"):
            get_client()


def test_get_client_creates_client_when_none() -> None:
    reset_client()
    with patch.object(agent_module.settings, "ANTHROPIC_API_KEY", "sk-test-123"):
        client = get_client()
        assert client is not None
        assert agent_module._client is client
    reset_client()


def test_get_client_reuses_cached_client() -> None:
    reset_client()
    with patch.object(agent_module.settings, "ANTHROPIC_API_KEY", "sk-test-abc"):
        c1 = get_client()
        c2 = get_client()
        assert c1 is c2
    reset_client()


def test_get_client_recreates_when_key_changes() -> None:
    reset_client()
    with patch.object(agent_module.settings, "ANTHROPIC_API_KEY", "sk-key-1"):
        c1 = get_client()
    with patch.object(agent_module.settings, "ANTHROPIC_API_KEY", "sk-key-2"):
        c2 = get_client()
    assert c1 is not c2
    reset_client()


# ---------------------------------------------------------------------------
# _parse_agent_response
# ---------------------------------------------------------------------------


def test_parse_agent_response_single_text_block() -> None:
    response = _make_response([_text_block("Hello world")])
    result = _parse_agent_response(response)  # type: ignore[arg-type]
    assert result.content == "Hello world"
    assert result.references == []
    assert result.tool_invocations == []


def test_parse_agent_response_multiple_text_blocks_joined() -> None:
    response = _make_response([_text_block("Part one."), _text_block("Part two.")])
    result = _parse_agent_response(response)  # type: ignore[arg-type]
    assert result.content == "Part one.\n\nPart two."


def test_parse_agent_response_empty_content_returns_empty_string() -> None:
    response = _make_response([])
    result = _parse_agent_response(response)  # type: ignore[arg-type]
    assert result.content == ""


def test_parse_agent_response_tool_use_block() -> None:
    block = _tool_use_block("web_search", {"query": "AI safety"})
    response = _make_response([block])
    result = _parse_agent_response(response)  # type: ignore[arg-type]
    assert len(result.tool_invocations) == 1
    assert result.tool_invocations[0].tool_name == "web_search"
    assert result.tool_invocations[0].tool_input == {"query": "AI safety"}


def test_parse_agent_response_web_search_result_block() -> None:
    entry = _web_search_result_entry("https://example.com", "Example", "A snippet")
    response = _make_response([_web_search_result_block([entry])])
    result = _parse_agent_response(response)  # type: ignore[arg-type]
    assert len(result.references) == 1
    assert result.references[0].url == "https://example.com"
    assert result.references[0].title == "Example"
    assert result.references[0].snippet == "A snippet"


def test_parse_agent_response_skips_non_web_search_entries() -> None:
    other_entry = SimpleNamespace(type="some_other_type")
    response = _make_response([_web_search_result_block([other_entry])])
    result = _parse_agent_response(response)  # type: ignore[arg-type]
    assert result.references == []


def test_parse_agent_response_mixed_blocks() -> None:
    response = _make_response([
        _text_block("Analysis:"),
        _tool_use_block("web_search", {"query": "test"}),
        _web_search_result_block([
            _web_search_result_entry("https://a.com", "A", "snippet A"),
        ]),
        _text_block("Conclusion."),
    ])
    result = _parse_agent_response(response)  # type: ignore[arg-type]
    assert result.content == "Analysis:\n\nConclusion."
    assert len(result.tool_invocations) == 1
    assert len(result.references) == 1


def test_parse_agent_response_handles_broken_web_search_block_gracefully() -> None:
    """A web_search_tool_result block with None content should not raise."""
    bad_block = SimpleNamespace(type="web_search_tool_result", content=None)
    response = _make_response([bad_block])
    result = _parse_agent_response(response)  # type: ignore[arg-type]
    assert result.references == []


# ---------------------------------------------------------------------------
# _extract_retry_after
# ---------------------------------------------------------------------------


def test_extract_retry_after_from_retry_after_header() -> None:
    exc = _make_rate_limit_exc(retry_after="30")
    assert _extract_retry_after(exc) == pytest.approx(30.0)  # type: ignore[arg-type]


def test_extract_retry_after_returns_none_when_no_headers() -> None:
    exc = _make_rate_limit_exc()
    assert _extract_retry_after(exc) is None  # type: ignore[arg-type]


def test_extract_retry_after_from_x_ratelimit_reset() -> None:
    future_ts = str(time.time() + 60)
    exc = _make_rate_limit_exc(reset_ts=future_ts)
    result = _extract_retry_after(exc)  # type: ignore[arg-type]
    assert result is not None
    assert result > 0


def test_extract_retry_after_past_reset_ts_returns_zero() -> None:
    past_ts = str(time.time() - 10)
    exc = _make_rate_limit_exc(reset_ts=past_ts)
    result = _extract_retry_after(exc)  # type: ignore[arg-type]
    assert result == 0.0


def test_extract_retry_after_prefers_retry_after_header() -> None:
    future_ts = str(time.time() + 600)
    exc = _make_rate_limit_exc(retry_after="45", reset_ts=future_ts)
    assert _extract_retry_after(exc) == pytest.approx(45.0)  # type: ignore[arg-type]


def test_extract_retry_after_handles_bad_header_gracefully() -> None:
    # float("not-a-number") raises ValueError which is caught;
    # no x-ratelimit-reset fallback is present, so None is returned.
    exc = _make_rate_limit_exc(retry_after="not-a-number")
    result = _extract_retry_after(exc)  # type: ignore[arg-type]
    assert result is None


def test_extract_retry_after_handles_missing_response_attr() -> None:
    # A plain object with no 'response' attribute — accessing it raises AttributeError,
    # which the function should catch and return None.
    exc = SimpleNamespace()
    result = _extract_retry_after(exc)  # type: ignore[arg-type]
    assert result is None


# ---------------------------------------------------------------------------
# call_agent
# ---------------------------------------------------------------------------


@pytest.fixture()
def mock_client() -> MagicMock:
    client = MagicMock()
    client.messages.create = AsyncMock()
    return client


async def test_call_agent_returns_agent_response(mock_client: MagicMock) -> None:
    mock_client.messages.create.return_value = _make_response([_text_block("Agent says hello.")])

    with patch("app.engine.agent.get_client", return_value=mock_client):
        agent = _make_agent()
        result = await call_agent(agent, [{"role": "user", "content": "Hello"}], "System prompt")

    assert isinstance(result, AgentResponse)
    assert result.content == "Agent says hello."


async def test_call_agent_passes_model_and_system_prompt(mock_client: MagicMock) -> None:
    mock_client.messages.create.return_value = _make_response([_text_block("Ok")])

    with patch("app.engine.agent.get_client", return_value=mock_client):
        agent = _make_agent(model="claude-opus-4-20250514")
        await call_agent(agent, [], "Custom system prompt")

    call_kwargs = mock_client.messages.create.call_args[1]
    assert call_kwargs["model"] == "claude-opus-4-20250514"
    assert call_kwargs["system"] == "Custom system prompt"
    assert call_kwargs["max_tokens"] == 4096


async def test_call_agent_includes_tools_when_provided(mock_client: MagicMock) -> None:
    mock_client.messages.create.return_value = _make_response([_text_block("Done")])
    tools = [{"type": "web_search_20250305", "name": "web_search", "max_uses": 2}]

    with patch("app.engine.agent.get_client", return_value=mock_client):
        await call_agent(_make_agent(), [], "System", tools=tools)

    call_kwargs = mock_client.messages.create.call_args[1]
    assert call_kwargs["tools"] == tools


async def test_call_agent_no_tools_param_when_tools_is_none(mock_client: MagicMock) -> None:
    mock_client.messages.create.return_value = _make_response([_text_block("Done")])

    with patch("app.engine.agent.get_client", return_value=mock_client):
        await call_agent(_make_agent(), [], "System", tools=None)

    call_kwargs = mock_client.messages.create.call_args[1]
    assert "tools" not in call_kwargs


async def test_call_agent_raises_rate_limit_error_on_429(mock_client: MagicMock) -> None:
    exc = _make_rate_limit_exc(retry_after="60")
    exc.__class__ = anthropic.RateLimitError
    mock_client.messages.create.side_effect = exc

    with patch("app.engine.agent.get_client", return_value=mock_client):
        with pytest.raises(RateLimitError):
            await call_agent(_make_agent(), [], "System")


async def test_call_agent_raises_runtime_error_on_api_status_error(
    mock_client: MagicMock,
) -> None:
    # Set __class__ so the except clause's isinstance() check passes.
    exc = MagicMock()
    exc.__class__ = anthropic.APIStatusError
    exc.status_code = 500
    exc.message = "Internal Server Error"
    mock_client.messages.create.side_effect = exc

    with patch("app.engine.agent.get_client", return_value=mock_client):
        with pytest.raises(RuntimeError):
            await call_agent(_make_agent(), [], "System")


async def test_call_agent_raises_runtime_error_on_connection_error(
    mock_client: MagicMock,
) -> None:
    exc = MagicMock()
    exc.__class__ = anthropic.APIConnectionError
    exc.__str__ = MagicMock(return_value="Connection refused")
    mock_client.messages.create.side_effect = exc

    with patch("app.engine.agent.get_client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="Unable to connect"):
            await call_agent(_make_agent(), [], "System")


# ---------------------------------------------------------------------------
# call_with_tool
# ---------------------------------------------------------------------------


async def test_call_with_tool_returns_tool_input(mock_client: MagicMock) -> None:
    tool_input = {"value": "true", "confidence": 0.9, "reasoning": "Clear evidence"}
    mock_client.messages.create.return_value = _make_response([
        _tool_use_block("cast_vote", tool_input)
    ])

    tool = {
        "name": "cast_vote",
        "description": "Cast a vote",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    }

    with patch("app.engine.agent.get_client", return_value=mock_client):
        result = await call_with_tool(
            model="claude-sonnet-4-20250514",
            messages=[{"role": "user", "content": "Vote now"}],
            system_prompt="System",
            tool=tool,
        )

    assert result == tool_input


async def test_call_with_tool_passes_tool_choice(mock_client: MagicMock) -> None:
    tool_input = {"summary": "A summary"}
    mock_client.messages.create.return_value = _make_response([
        _tool_use_block("summarize_response", tool_input)
    ])

    tool = {
        "name": "summarize_response",
        "description": "Summarize",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    }

    with patch("app.engine.agent.get_client", return_value=mock_client):
        await call_with_tool(
            model="claude-sonnet-4-20250514",
            messages=[],
            system_prompt="S",
            tool=tool,
        )

    call_kwargs = mock_client.messages.create.call_args[1]
    assert call_kwargs["tool_choice"] == {"type": "tool", "name": "summarize_response"}
    assert call_kwargs["tools"] == [tool]


async def test_call_with_tool_raises_runtime_error_when_no_tool_use_block(
    mock_client: MagicMock,
) -> None:
    mock_client.messages.create.return_value = _make_response([_text_block("Unexpected text")])

    tool = {
        "name": "cast_vote",
        "description": "Cast a vote",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    }

    with patch("app.engine.agent.get_client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="Expected tool_use block"):
            await call_with_tool(
                model="claude-sonnet-4-20250514",
                messages=[],
                system_prompt="S",
                tool=tool,
            )


async def test_call_with_tool_raises_rate_limit_error_on_429(mock_client: MagicMock) -> None:
    exc = _make_rate_limit_exc(retry_after="30")
    exc.__class__ = anthropic.RateLimitError
    mock_client.messages.create.side_effect = exc

    tool = {
        "name": "cast_vote",
        "description": "Cast",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    }

    with patch("app.engine.agent.get_client", return_value=mock_client):
        with pytest.raises(RateLimitError):
            await call_with_tool(
                model="claude-sonnet-4-20250514",
                messages=[],
                system_prompt="S",
                tool=tool,
            )


async def test_call_with_tool_raises_runtime_error_on_connection_error(
    mock_client: MagicMock,
) -> None:
    exc = MagicMock()
    exc.__class__ = anthropic.APIConnectionError
    exc.__str__ = MagicMock(return_value="No route to host")
    mock_client.messages.create.side_effect = exc

    tool = {
        "name": "cast_vote",
        "description": "Cast",
        "input_schema": {"type": "object", "properties": {}, "required": []},
    }

    with patch("app.engine.agent.get_client", return_value=mock_client):
        with pytest.raises(RuntimeError, match="Unable to connect"):
            await call_with_tool(
                model="claude-sonnet-4-20250514",
                messages=[],
                system_prompt="S",
                tool=tool,
            )
