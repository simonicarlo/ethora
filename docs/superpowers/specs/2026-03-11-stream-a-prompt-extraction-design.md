# Stream A — System Prompt Extraction & Enhancement

> Design spec for extracting inline prompts into editable template files with deliberation framing.

## Overview

Replace hardcoded prompt strings in `council.py` with external template files loaded via `str.format()`. Add deliberation framing that wraps each agent's custom system prompt with council context (other agents, voting mechanism, rounds).

## Template Files

Located at `backend/app/engine/prompts/`:

| File | Purpose | Variables |
|------|---------|-----------|
| `deliberation_system.txt` | Wraps agent's custom prompt with council context | `{council_name}`, `{agent_name}`, `{agent_list}`, `{voting_mechanism}`, `{rounds}`, `{agent_system_prompt}` |
| `voting_prompt.txt` | Vote request after deliberation | `{input_claim}`, `{debate_text}`, `{vote_format}` |
| `continuation_nudge.txt` | Nudge when last message is assistant | (none) |

## Loader (`loader.py`)

- `load_template(name: str) -> str` — Reads a `.txt` file from the `prompts/` directory, caches in a module-level dict.
- `render_deliberation_system(council_name, agent_name, agent_list, voting_mechanism, rounds, agent_system_prompt) -> str` — Renders the deliberation system prompt.
- `render_voting_prompt(input_claim, debate_text, question_type) -> str` — Renders the voting prompt. Builds `{vote_format}` in Python based on `question_type` (binary vs open), keeping the template clean.

## Changes to `council.py`

- `run_council_session()`: For each agent, call `render_deliberation_system(...)` to build the system prompt that wraps the agent's custom prompt with council context. Pass this to `call_agent()` instead of raw `agent.system_prompt`.
- `_build_voting_prompt()`: Replace inline f-string with `render_voting_prompt(...)`.
- `_build_agent_messages()`: Replace hardcoded continuation nudge string with `load_template("continuation_nudge.txt")`.

## What doesn't change

- `agent.py` — still takes a `system_prompt: str` parameter
- SSE events, frontend, DB models — all unchanged

## Template content

### `deliberation_system.txt`

Provides council awareness:
- Council name
- Agent's name and role in the council
- List of other participating agents
- Voting mechanism being used
- Total rounds
- The agent's own custom system prompt (appended at the end)

### `voting_prompt.txt`

Summarizes the debate and asks for a JSON vote. The `{vote_format}` variable is built by `loader.py`:
- Binary: `{"value": "true" or "false", "confidence": 0.0-1.0, "reasoning": "..."}`
- Open: placeholder for future candidate-based voting (Stream D)

### `continuation_nudge.txt`

Simple nudge text, no variables. Replaces the hardcoded string in `_build_agent_messages()`.
