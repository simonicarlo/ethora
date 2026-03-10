# SSE — CLAUDE.md

## Purpose
Server-Sent Events formatting utilities.

## Key Design Choices
- **Simple formatter**: `format_sse(event, data)` returns a properly formatted SSE string
- **JSON data**: All event data is JSON-serialized
- **No connection management here**: SSE connections are managed in `sessions.py` via `StreamingResponse`

## SSE Protocol
Each event has the format:
```
event: <type>\ndata: <json>\n\n
```
Event types: `agent_message`, `round_complete`, `voting_cast`, `verdict`, `status`
