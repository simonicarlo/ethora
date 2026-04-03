"""Tests for app/engine/tools.py — tool definition structure and schemas."""
from __future__ import annotations

from app.engine.tools import (
    AGENT_TOOLS,
    CAST_VOTE_TOOL,
    CLOSING_STATEMENT_TOOL,
    DEDUPLICATE_CANDIDATES_TOOL,
    PROPOSE_CANDIDATES_TOOL,
    SET_STAGE_TOOL,
    SUMMARIZE_RESPONSE_TOOL,
    WEB_SEARCH_TOOL,
)

# ---------------------------------------------------------------------------
# WEB_SEARCH_TOOL
# ---------------------------------------------------------------------------


def test_web_search_tool_has_required_keys() -> None:
    assert "type" in WEB_SEARCH_TOOL
    assert "name" in WEB_SEARCH_TOOL


def test_web_search_tool_type() -> None:
    assert WEB_SEARCH_TOOL["type"] == "web_search_20250305"


def test_web_search_tool_name() -> None:
    assert WEB_SEARCH_TOOL["name"] == "web_search"


def test_web_search_tool_max_uses() -> None:
    assert WEB_SEARCH_TOOL["max_uses"] == 2


def test_agent_tools_contains_web_search() -> None:
    assert WEB_SEARCH_TOOL in AGENT_TOOLS


def test_agent_tools_is_list() -> None:
    assert isinstance(AGENT_TOOLS, list)


# ---------------------------------------------------------------------------
# CAST_VOTE_TOOL
# ---------------------------------------------------------------------------


def test_cast_vote_tool_name() -> None:
    assert CAST_VOTE_TOOL["name"] == "cast_vote"


def test_cast_vote_tool_has_description() -> None:
    assert "description" in CAST_VOTE_TOOL
    assert CAST_VOTE_TOOL["description"]


def test_cast_vote_tool_schema_type_object() -> None:
    assert CAST_VOTE_TOOL["input_schema"]["type"] == "object"


def test_cast_vote_tool_required_fields() -> None:
    required = CAST_VOTE_TOOL["input_schema"]["required"]
    assert "value" in required
    assert "confidence" in required
    assert "reasoning" in required


def test_cast_vote_tool_value_is_string() -> None:
    assert CAST_VOTE_TOOL["input_schema"]["properties"]["value"]["type"] == "string"


def test_cast_vote_tool_confidence_is_number() -> None:
    assert CAST_VOTE_TOOL["input_schema"]["properties"]["confidence"]["type"] == "number"


# ---------------------------------------------------------------------------
# PROPOSE_CANDIDATES_TOOL
# ---------------------------------------------------------------------------


def test_propose_candidates_tool_name() -> None:
    assert PROPOSE_CANDIDATES_TOOL["name"] == "propose_candidates"


def test_propose_candidates_tool_required_fields() -> None:
    required = PROPOSE_CANDIDATES_TOOL["input_schema"]["required"]
    assert "candidates" in required


def test_propose_candidates_tool_candidates_is_array() -> None:
    props = PROPOSE_CANDIDATES_TOOL["input_schema"]["properties"]
    assert props["candidates"]["type"] == "array"


def test_propose_candidates_tool_min_max_items() -> None:
    candidates_schema = PROPOSE_CANDIDATES_TOOL["input_schema"]["properties"]["candidates"]
    assert candidates_schema["minItems"] == 1
    assert candidates_schema["maxItems"] == 3


# ---------------------------------------------------------------------------
# SUMMARIZE_RESPONSE_TOOL
# ---------------------------------------------------------------------------


def test_summarize_response_tool_name() -> None:
    assert SUMMARIZE_RESPONSE_TOOL["name"] == "summarize_response"


def test_summarize_response_tool_required_summary() -> None:
    assert "summary" in SUMMARIZE_RESPONSE_TOOL["input_schema"]["required"]


def test_summarize_response_tool_summary_is_string() -> None:
    props = SUMMARIZE_RESPONSE_TOOL["input_schema"]["properties"]
    assert props["summary"]["type"] == "string"


# ---------------------------------------------------------------------------
# CLOSING_STATEMENT_TOOL
# ---------------------------------------------------------------------------


def test_closing_statement_tool_name() -> None:
    assert CLOSING_STATEMENT_TOOL["name"] == "closing_statement"


def test_closing_statement_tool_required_statement() -> None:
    assert "statement" in CLOSING_STATEMENT_TOOL["input_schema"]["required"]


# ---------------------------------------------------------------------------
# SET_STAGE_TOOL
# ---------------------------------------------------------------------------


def test_set_stage_tool_name() -> None:
    assert SET_STAGE_TOOL["name"] == "set_stage"


def test_set_stage_tool_required_intro_text() -> None:
    assert "intro_text" in SET_STAGE_TOOL["input_schema"]["required"]


# ---------------------------------------------------------------------------
# DEDUPLICATE_CANDIDATES_TOOL
# ---------------------------------------------------------------------------


def test_deduplicate_candidates_tool_name() -> None:
    assert DEDUPLICATE_CANDIDATES_TOOL["name"] == "deduplicate_candidates"


def test_deduplicate_candidates_tool_required_fields() -> None:
    required = DEDUPLICATE_CANDIDATES_TOOL["input_schema"]["required"]
    assert "candidates" in required
    assert "explanation" in required


def test_deduplicate_candidates_tool_candidates_is_array() -> None:
    props = DEDUPLICATE_CANDIDATES_TOOL["input_schema"]["properties"]
    assert props["candidates"]["type"] == "array"


def test_deduplicate_candidates_tool_explanation_is_string() -> None:
    props = DEDUPLICATE_CANDIDATES_TOOL["input_schema"]["properties"]
    assert props["explanation"]["type"] == "string"


# ---------------------------------------------------------------------------
# All structured tools share common shape
# ---------------------------------------------------------------------------

_STRUCTURED_TOOLS = [
    CAST_VOTE_TOOL,
    PROPOSE_CANDIDATES_TOOL,
    SUMMARIZE_RESPONSE_TOOL,
    CLOSING_STATEMENT_TOOL,
    SET_STAGE_TOOL,
    DEDUPLICATE_CANDIDATES_TOOL,
]


def test_all_structured_tools_have_name() -> None:
    for tool in _STRUCTURED_TOOLS:
        assert "name" in tool, f"Tool missing 'name': {tool}"


def test_all_structured_tools_have_description() -> None:
    for tool in _STRUCTURED_TOOLS:
        assert "description" in tool, f"Tool missing 'description': {tool}"
        assert tool["description"], f"Tool has empty 'description': {tool}"


def test_all_structured_tools_have_input_schema() -> None:
    for tool in _STRUCTURED_TOOLS:
        assert "input_schema" in tool, f"Tool missing 'input_schema': {tool}"
        schema = tool["input_schema"]
        assert schema["type"] == "object"
        assert "properties" in schema
        assert "required" in schema
