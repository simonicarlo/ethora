# SSE — CLAUDE.md

## Purpose
Server-Sent Events formatting utilities and event type constants.

## Modules
- **`emitter.py`**: `format_sse(event, data)` returns a properly formatted SSE string with JSON-serialized data
- **`events.py`**: Named constants for all 18 SSE event types — single source of truth for event names used by `council.py` and `sessions.py`

## Key Design Choices
- **JSON data**: All event data is JSON-serialized
- **No connection management here**: SSE connections are managed in `sessions.py` via `StreamingResponse`
- **Constants over strings**: All event type strings are defined in `events.py` to prevent typos and enable IDE navigation

## SSE Protocol
Each event has the format:
```
event: <type>\ndata: <json>\n\n
```
Event types (see `events.py`): `stage_set`, `stage_set_intro`, `agent_message`, `agent_typing`, `summary_ready`, `tool_use`, `round_complete`, `candidate_proposed`, `candidates_finalized`, `moderator_action`, `voting_started`, `voting_cast`, `closing_statement`, `awaiting_human_turn`, `awaiting_human_vote`, `verdict`, `rate_limited`, `error`
