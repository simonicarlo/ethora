"""Prompt template loader with caching and variable interpolation.

Templates are plain .txt files in this directory using {variable} placeholders.
Loaded once and cached in memory (templates don't change at runtime).

Uses str.replace() chains instead of str.format() because user-supplied content
(agent system prompts, debate text) can contain literal braces that would break
format().
"""
from __future__ import annotations

from pathlib import Path
from typing import Literal

_TEMPLATES_DIR = Path(__file__).parent
_cache: dict[str, str] = {}

# Pre-built vote format strings (injected as {vote_format} in voting_prompt.txt)
_BINARY_VOTE_FORMAT = (
    '{"value": "true" or "false", "confidence": 0.0 to 1.0, "reasoning": "your reasoning"}'
)
_OPEN_VOTE_FORMAT = (
    '{"value": "<your chosen candidate>", "confidence": 0.0 to 1.0, "reasoning": "your reasoning"}'
)


def load_template(name: str) -> str:
    """Load a template file by name, caching the result."""
    if "/" in name or "\\" in name:
        raise ValueError(f"Template name must not contain path separators: {name}")
    if name not in _cache:
        path = _TEMPLATES_DIR / name
        if not path.is_file():
            raise FileNotFoundError(f"Template not found: {path}")
        _cache[name] = path.read_text(encoding="utf-8")
    return _cache[name]


def _clear_cache() -> None:
    """Clear the template cache. For testing only."""
    _cache.clear()


def _render(template: str, variables: dict[str, str]) -> str:
    """Replace {variable} placeholders using str.replace() — safe for user content with braces."""
    result = template
    for key, value in variables.items():
        result = result.replace("{" + key + "}", value)
    return result


def render_deliberation_system(
    *,
    council_name: str,
    agent_name: str,
    agent_list: str,
    voting_mechanism: str,
    rounds: int,
    agent_system_prompt: str,
) -> str:
    """Render the deliberation system prompt that wraps an agent's custom prompt."""
    template = load_template("deliberation_system.txt")
    return _render(template, {
        "council_name": council_name,
        "agent_name": agent_name,
        "agent_list": agent_list,
        "voting_mechanism": voting_mechanism,
        "rounds": str(rounds),
        "agent_system_prompt": agent_system_prompt,
    })


def render_voting_prompt(
    *,
    input_claim: str,
    debate_text: str,
    question_type: Literal["binary", "open"] = "binary",
) -> str:
    """Render the voting prompt with the appropriate vote format."""
    template = load_template("voting_prompt.txt")
    vote_format = _BINARY_VOTE_FORMAT if question_type == "binary" else _OPEN_VOTE_FORMAT
    return _render(template, {
        "input_claim": input_claim,
        "debate_text": debate_text,
        "vote_format": vote_format,
    })


def render_continuation_nudge() -> str:
    """Return the continuation nudge text."""
    return load_template("continuation_nudge.txt").strip()
