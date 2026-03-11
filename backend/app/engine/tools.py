"""Claude API tool definitions for structured output.

Each tool schema forces Claude to return data in a guaranteed format via
tool_choice={"type": "tool", "name": ...}, eliminating fragile JSON parsing.
"""
from __future__ import annotations

CAST_VOTE_TOOL: dict = {
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

PROPOSE_CANDIDATES_TOOL: dict = {
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

DEDUPLICATE_CANDIDATES_TOOL: dict = {
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
