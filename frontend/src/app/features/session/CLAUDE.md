# Session Feature — CLAUDE.md

## Purpose
Real-time debate visualization, voting display, and human interaction during a deliberation session.

## Components
- `session-view/` — Container component; manages session state, SSE connection, and child coordination
- `voting-panel/` — Displays agent votes with confidence bars and color-coded chips
- `verdict-card/` — Shows final verdict with decision icon, confidence bar, and summary
- `human-vote-form/` — Form for human-in-loop voting (decision toggle, confidence slider, reasoning)

## Key Design Choices
- **Container/presenter pattern**: `SessionView` holds state (signals); child components receive data via `input()`
- **SSE-driven state machine**: `handleSseEvent()` transitions session status based on event types
- **DestroyRef cleanup**: SSE subscription is cleaned up via `destroyRef.onDestroy()` (not `ngOnDestroy`)
- **Graceful SSE error**: On connection loss, only sets error status if session wasn't already complete
- **Color mapping**: Vote/verdict values map to CSS classes (`affirm`, `oppose`, `neutral`) for consistent theming
