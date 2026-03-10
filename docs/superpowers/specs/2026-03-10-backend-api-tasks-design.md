# Backend API Tasks — Design Spec

> Human turn pause-resume, `get_or_404` helper, `selectinload` fix

## 1. Human Turn Injection (Pause-Resume)

### Overview

When a council has `allow_human_turns=True`, the engine pauses after each round (except the last) to let a human inject a message into the debate. The SSE stream closes on pause and reopens on resume.

### Session Status Lifecycle

```
pending → running → [awaiting_human_turn → pending → running]* → voting → complete
                                                                    ↘ error
```

A new status `"awaiting_human_turn"` is added to the `SessionStatus` literal.

### Engine Changes (`council.py`)

**Resume-aware entry point:**

On entry, `run_council_session` loads existing `Round` rows for the session to determine where to resume:

- If no rounds exist → fresh start at round 1
- If N rounds exist → resume at round N+1, rebuild history from persisted `Message` rows

**Pause after each round:**

After yielding `round_complete`, if `council.allow_human_turns` is true AND more rounds remain:

1. Set `session.status = "awaiting_human_turn"`
2. Commit the transaction
3. Yield `awaiting_human_turn` SSE event with `{"round": round_num, "message": "Waiting for human input"}`
4. Return (generator exits, SSE stream closes)

**History rebuild from DB:**

New helper `_load_history_from_db(db, session_id)` queries all `Message` rows for the session (joined with `Round` and `Agent`), ordered by round number and creation time, returning the same `list[tuple[str, UUID | None, str]]` format used by the in-memory history. Human messages have `agent_id=None` and name `"Human"`.

**Type annotation updates:**

The `history` variable in `run_council_session` and the `history` parameter in both `_build_agent_messages()` and `_build_voting_prompt()` must change from `list[tuple[str, uuid.UUID, str]]` to `list[tuple[str, uuid.UUID | None, str]]` to accommodate human messages with `agent_id=None`.

**Human messages in debate context:**

`_build_agent_messages()` treats human messages (where `agent_id is None`) as `"user"` role with `[Human]:` prefix — same as other-agent messages.

### Model Change (`models.py`)

`Message.agent_id` becomes nullable:

```python
agent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("agents.id"), nullable=True)
```

This allows storing human-authored messages without a fake agent record.

### Schema Change (`schemas.py`)

Add `"awaiting_human_turn"` to the `SessionStatus` literal:

```python
SessionStatus = Literal["pending", "running", "voting", "awaiting_human_turn", "complete", "error"]
```

Update `MessageResponse.agent_id` to be optional (since human messages have no agent):

```python
agent_id: uuid.UUID | None = None
```

### Endpoint: `submit_human_turn` (`sessions.py`)

**Status code:** 202 Accepted

**Guards:**
- 404 if session not found
- 409 if `session.status != "awaiting_human_turn"`
- 409 if council's `allow_human_turns` is false (load council via `session.council_id` using `get_or_404` or a direct query — the session's `lazy="selectin"` relationship may not be loaded in the request-scoped session)

**Logic:**
1. Find the latest `Round` for the session (highest `round_number`)
2. Create a `Message` with `round_id=latest_round.id`, `agent_id=None`, `content=payload.content`
3. Set `session.status = "pending"` (allows stream to be reopened)
4. Flush and return `{"status": "accepted"}`

### Endpoint: `stream_session` (`sessions.py`)

Update the status guard to accept both `"pending"` (fresh or resumed):

```python
if session.status not in ("pending",):
    raise HTTPException(409, ...)
```

No other changes — the engine handles resume logic internally.

**Concurrency note:** There is no lock preventing two concurrent stream connections for the same session. For the PoC this is acceptable — the frontend controls the flow. A production hardening step would be to atomically transition status from `"pending"` to `"running"` with `SELECT ... FOR UPDATE` in the engine entry point.

### SSE Event

New event type:

| Event | Data fields | When |
|-------|-------------|------|
| `awaiting_human_turn` | `round`, `message` | After a round when `allow_human_turns` is true and more rounds remain |

### Frontend Integration (not in scope)

The frontend would:
1. Detect `awaiting_human_turn` SSE event
2. Show an input form
3. POST to `/sessions/{id}/human-turn`
4. Reconnect to `/sessions/{id}/stream` to resume

---

## 2. Extract `get_or_404` Helper (`deps.py`)

### Current Pattern (repeated 6 times)

```python
result = await db.execute(select(Model).where(Model.id == some_id))
obj = result.scalar_one_or_none()
if obj is None:
    raise HTTPException(status_code=404, detail="X not found")
```

### New Helper

```python
async def get_or_404(
    db: AsyncSession,
    model: type[T],
    id: uuid.UUID,
    detail: str = "Not found",
) -> T:
    result = await db.execute(select(model).where(model.id == id))
    obj = result.scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail=detail)
    return obj
```

Generic over `T` (bound to `Base`) for type safety. Placed in `deps.py` alongside `DBSession`.

### Call Sites

| File | Endpoint | Model | Detail |
|------|----------|-------|--------|
| `sessions.py` | `get_session` | `Session` | "Session not found" |
| `sessions.py` | `stream_session` | `Session` | "Session not found" |
| `sessions.py` | `submit_human_turn` | `Session` | "Session not found" |
| `sessions.py` | `submit_human_vote` | `Session` | "Session not found" |
| `sessions.py` | `get_verdict` | `Verdict` | "Verdict not found" |
| `councils.py` | `get_council` | `Council` | "Council not found" |

---

## 3. `selectinload` for Council List (`councils.py`)

### Problem

`list_councils` uses `select(Council)` without explicit eager loading. The model already declares `lazy="selectin"` on `Council.agents`, so there is no N+1 bug today. However, adding an explicit `selectinload` is a belt-and-suspenders measure that makes the intent visible at the query site and protects against future changes to the model default.

### Fix

```python
from sqlalchemy.orm import selectinload

result = await db.execute(
    select(Council).options(selectinload(Council.agents))
)
```

One-line change.

---

## Testing Strategy

### Human Turn Tests (`test_council.py`)

- **Pause after round**: 2 agents, 2 rounds, `allow_human_turns=True` — verify engine pauses after round 1 with `awaiting_human_turn` event and session status
- **Resume with human message**: Seed a session with 1 completed round + human message, run engine — verify it starts at round 2 and includes human message in history
- **Human message in debate context**: Verify `_build_agent_messages` treats `agent_id=None` entries as `[Human]:` user messages
- **No pause on last round**: Verify engine does NOT pause after the final round (goes straight to voting)
- **No pause when disabled**: `allow_human_turns=False` — verify no pause events

### Human Turn API Tests

- `submit_human_turn` with valid `awaiting_human_turn` status → 202
- `submit_human_turn` with wrong status → 409
- `submit_human_turn` with nonexistent session → 404

### `get_or_404` Tests

- Found → returns object
- Not found → raises 404

### `selectinload` Test

- `list_councils` returns councils with agents populated
