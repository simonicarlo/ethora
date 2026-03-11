"""Claude API tool definitions for structured output.

Each tool schema forces Claude to return data in a guaranteed format via
tool_choice={"type": "tool", "name": ...}, eliminating fragile JSON parsing.

Also defines agent tools (web_search, code_execution) that agents can use during
deliberation when tools_enabled is true on the council. code_execution is an
Anthropic server-side tool required by the web_search dynamic filtering feature.
"""
from __future__ import annotations

from typing import Any

# -- Agent tools (used during deliberation when tools_enabled=True) -----------

WEB_SEARCH_TOOL: dict[str, Any] = {
    "type": "web_search_20250305",
    "name": "web_search",
    "max_uses": 3,
}

# code_execution is auto-injected by the API when web_search uses dynamic
# filtering — passing it explicitly causes a duplicate-tool-name 400 error.
AGENT_TOOLS: list[dict[str, Any]] = [WEB_SEARCH_TOOL]

CAST_VOTE_TOOL: dict[str, Any] = {
    "name": "cast_vote",
    "description": "Cast your vote on the deliberation topic.",
    "input_schema": {
        "type": "object",
        "properties": {
            "value": {
                "type": "string",
                "description": "Your vote — 'true'/'false' for binary, or exact candidate text for open",
            },
            "confidence": {
                "type": "number",
                "description": "Confidence level from 0.0 to 1.0",
            },
            "reasoning": {
                "type": "string",
                "description": "Brief explanation for your vote",
            },
        },
        "required": ["value", "confidence", "reasoning"],
    },
}

PROPOSE_CANDIDATES_TOOL: dict[str, Any] = {
    "name": "propose_candidates",
    "description": "Propose 1-3 candidate answers based on the deliberation.",
    "input_schema": {
        "type": "object",
        "properties": {
            "candidates": {
                "type": "array",
                "items": {"type": "string"},
                "minItems": 1,
                "maxItems": 3,
                "description": "List of concise, distinct candidate answers",
            },
        },
        "required": ["candidates"],
    },
}

SUMMARIZE_RESPONSE_TOOL: dict[str, Any] = {
    "name": "summarize_response",
    "description": "Produce a concise 1-2 sentence summary of an agent's response.",
    "input_schema": {
        "type": "object",
        "properties": {
            "summary": {
                "type": "string",
                "description": "A 1-2 sentence summary capturing the agent's key argument or position",
            },
        },
        "required": ["summary"],
    },
}


CLOSING_STATEMENT_TOOL: dict[str, Any] = {
    "name": "closing_statement",
    "description": "Provide your closing statement summarizing your final position.",
    "input_schema": {
        "type": "object",
        "properties": {
            "statement": {
                "type": "string",
                "description": "Your structured closing statement with key findings and conclusions",
            },
        },
        "required": ["statement"],
    },
}

DEDUPLICATE_CANDIDATES_TOOL: dict[str, Any] = {
    "name": "deduplicate_candidates",
    "description": "Merge semantically equivalent candidates and return the normalized list.",
    "input_schema": {
        "type": "object",
        "properties": {
            "candidates": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Deduplicated, normalized candidate list",
            },
            "explanation": {
                "type": "string",
                "description": "Brief explanation of any merges performed",
            },
        },
        "required": ["candidates", "explanation"],
    },
}
