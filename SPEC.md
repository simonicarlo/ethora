# SPEC — Ethora

> Target specification for frontend–backend integration. Source of truth for API contracts,
> SSE events, session lifecycle, and UI behaviour.

---

## Project Vision

Ethora is a multi-agent deliberation framework. AI agents (each with a custom system prompt) debate a question, challenge each other, and reach a verdict via a configurable voting mechanism. The debate is visualised in a real-time multi-panel UI.

---

## Session Lifecycle

```
                         POST /sessions
                              │
                              ▼
                         ┌─────────┐
                         │ pending │
                         └────┬────┘
                              │  GET /sessions/{id}/stream
                              ▼
                         ┌─────────┐
                    ┌───▶│ running │◀──────────────────────┐
                    │    └────┬────┘                        │
                    │         │ round_complete               │
                    │         │ (allow_human_turns &&        │
                    │         │  round < max_rounds)         │
                    │         ▼                              │
                    │    ┌────────────────────┐              │
                    │    │ awaiting_human_turn│              │
                    │    └────────┬───────────┘              │
                    │             │ POST /human-turn         │
                    │             │ → status reset to        │
                    │             │   "pending"              │
                    │             ▼                          │
                    │        ┌─────────┐                     │
                    │        │ pending │ (re-stream)─────────┘
                    │        └─────────┘
                    │
                    │    (after final round)
                    │         │
                    │         ▼
                    │    ┌─────────┐
                    │    │ voting  │
                    │    └────┬────┘
                    │         │
                    │         ├── (majority/weighted/consensus)
                    │         │         │
                    │         │         ▼
                    │         │    ┌──────────┐
                    │         │    │ complete │
                    │         │    └──────────┘
                    │         │
                    │         └── (human_in_loop)
                    │               │
                    │               ▼
                    │    ┌─────────────────────┐
                    │    │ awaiting_human_vote  │ (no DB status; SSE event only)
                    │    └────────┬────────────┘
                    │             │ POST /human-vote
                    │             ▼
                    │        ┌──────────┐
                    │        │ complete │
                    │        └──────────┘
                    │
                    │    (on error at any point)
                    │         │
                    │         ▼
                    │    ┌─────────┐
                    │    │  error  │
                    │    └─────────┘
```

### Status values (DB column `Session.status`)

| Status                | Meaning                                               |
|-----------------------|-------------------------------------------------------|
| `pending`             | Created but not yet streamed, or resumed after human turn |
| `running`             | Deliberation rounds in progress                       |
| `awaiting_human_turn` | Paused between rounds waiting for human input         |
| `voting`              | Agents are casting votes                              |
| `complete`            | Verdict rendered                                      |
| `error`               | Engine failure                                        |

---

## API Contract

All endpoints are prefixed with `/api/v1`.

### Agents

| Method | Path | Request Body | Response | Status |
|--------|------|-------------|----------|--------|
| `POST` | `/agents` | `AgentCreate` | `AgentResponse` | 201 |
| `GET`  | `/agents` | — | `AgentResponse[]` | 200 |

**AgentCreate**
```json
{ "name": "string", "system_prompt": "string", "model?": "string" }
```
- `name`: 1–100 chars
- `system_prompt`: min 1 char
- `model`: defaults to `"claude-sonnet-4-20250514"`

**AgentResponse**
```json
{ "id": "uuid", "name": "string", "system_prompt": "string", "model": "string" }
```

---

### Councils

| Method | Path | Request Body | Response | Status |
|--------|------|-------------|----------|--------|
| `POST` | `/councils` | `CouncilCreate` | `CouncilResponse` | 201 |
| `GET`  | `/councils` | — | `CouncilResponse[]` | 200 |
| `GET`  | `/councils/{id}` | — | `CouncilResponse` | 200 |

**CouncilCreate**
```json
{
  "name": "string",
  "rounds?": 3,
  "voting_mechanism?": "majority",
  "allow_human_turns?": false,
  "agent_ids": ["uuid", "uuid"]
}
```
- `rounds`: 1–20, default 3
- `voting_mechanism`: `"majority"` | `"weighted"` | `"consensus"` | `"human_in_loop"`
- `agent_ids`: min 2 agents required

**CouncilResponse**
```json
{
  "id": "uuid",
  "name": "string",
  "rounds": 3,
  "voting_mechanism": "majority",
  "allow_human_turns": false,
  "agents": [AgentResponse, ...]
}
```

---

### Sessions

| Method | Path | Request Body | Response | Status |
|--------|------|-------------|----------|--------|
| `POST` | `/sessions` | `SessionCreate` | `SessionResponse` | 201 |
| `GET`  | `/sessions/{id}` | — | `SessionResponse` | 200 |
| `GET`  | `/sessions/{id}/stream` | — | SSE stream | 200 |
| `POST` | `/sessions/{id}/human-turn` | `HumanTurnRequest` | `{ "status": "accepted" }` | 202 |
| `POST` | `/sessions/{id}/human-vote` | `HumanVoteRequest` | `VerdictResponse` | 201 |
| `GET`  | `/sessions/{id}/verdict` | — | `VerdictResponse` | 200 |

**SessionCreate**
```json
{ "council_id": "uuid", "input_claim": "string" }
```

**SessionResponse**
```json
{
  "id": "uuid",
  "council_id": "uuid",
  "input_claim": "string",
  "status": "pending|running|voting|awaiting_human_turn|complete|error",
  "created_at": "ISO-8601"
}
```

**HumanTurnRequest**
```json
{ "content": "string" }
```

**HumanVoteRequest**
```json
{ "decision": "string", "confidence": 0.0-1.0, "reasoning?": "string" }
```

**VerdictResponse**
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "decision": "string",
  "confidence": 0.0-1.0,
  "summary": "string|null",
  "created_at": "ISO-8601"
}
```

### Error responses

- **404** — Resource not found (`{ "detail": "Session not found" }`)
- **409** — State conflict (`{ "detail": "Session is 'running', expected 'pending'" }`)

---

## SSE Event Contract

Stream URL: `GET /api/v1/sessions/{id}/stream`

Content type: `text/event-stream`

Precondition: session must be in `pending` status (returns 409 otherwise).

### Events emitted by the backend

| Event name | Data fields | When emitted |
|------------|-------------|-------------|
| `agent_message` | `agent_id`, `agent_name`, `round`, `content` | After each agent completes its response |
| `round_complete` | `round` | After all agents in a round have responded |
| `awaiting_human_turn` | `round`, `message` | After a round when `allow_human_turns` is enabled (not last round) |
| `voting_cast` | `agent_id`, `agent_name`, `vote`, `confidence`, `reasoning` | After each agent casts a vote |
| `awaiting_human_vote` | `message` | When `human_in_loop` voting is used (instead of auto-tally) |
| `verdict` | `decision`, `confidence`, `summary` | Final verdict rendered |
| `error` | `message` | On engine failure |

### Wire format

Each event is formatted as:
```
event: <event_name>\ndata: <json>\n\n
```

### Frontend SSE event list (current)

The frontend `SseService` currently listens for: `agent_message`, `round_complete`, `voting_cast`, `verdict`, `status`.

### Alignment gaps

| Issue | Backend emits | Frontend expects | Fix needed |
|-------|--------------|-----------------|------------|
| Human turn pause | `awaiting_human_turn` | `status` with `data.status === "waiting_for_human"` | Frontend: listen for `awaiting_human_turn` |
| Human vote wait | `awaiting_human_vote` | Not handled | Frontend: listen for `awaiting_human_vote`, show human vote form |
| Error event | `error` | Not in SSE_EVENTS list | Frontend: add `error` to SSE_EVENTS |
| Session status type | Backend has `awaiting_human_turn` | Frontend `SessionStatus` missing `awaiting_human_turn` | Frontend: add to type |
| Vote field naming | Backend sends `vote` | Frontend `Vote` interface uses `value` | Frontend: map `vote` → `value` in handler |

---

## Voting Mechanisms

| Mechanism | Behaviour | Verdict source |
|-----------|-----------|---------------|
| `majority` | Simple count — most common value wins | Auto (engine) |
| `weighted` | Sum confidence per value — highest weighted value wins | Auto (engine) |
| `consensus` | All agents must agree; returns `no_consensus` otherwise | Auto (engine) |
| `human_in_loop` | Agents vote, then engine raises `HumanVoteRequired`; UI shows form, human submits via `POST /human-vote` | Human |

### Vote shape (from agents)

Agents respond with JSON: `{ "value": "true"|"false", "confidence": 0.0-1.0, "reasoning": "..." }`

Fallback on parse failure: `{ "value": "abstain", "confidence": 0.0, "reasoning": "<raw text>" }`

---

## Frontend Navigation

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Home` | Landing page with hero text and CTA |
| `/councils` | `CouncilList` | Card grid of existing councils |
| `/councils/new` | `CouncilCreate` | Form to create a council (select existing agents) |
| `/sessions/:id` | `SessionView` | Live debate view with panels |

### Missing routes (to be added)

| Route | Component | Purpose |
|-------|-----------|---------|
| `/agents` | `AgentList` | List/manage agents |
| `/agents/new` | `AgentCreate` | Form to create an agent |

### Navigation flow for starting a session

1. User navigates to `/councils`
2. Clicks a council card → opens a "Start Session" dialog
3. User enters the input claim (debate topic)
4. `POST /sessions` → receives `SessionResponse` with `id`
5. Navigate to `/sessions/{id}`
6. `SessionView` calls `GET /sessions/{id}/stream` → SSE begins

---

## UI Component Inventory

### Implemented

| Component | Location | Purpose |
|-----------|----------|---------|
| `Home` | `features/home/` | Landing page |
| `CouncilList` | `features/council/` | Council card grid |
| `CouncilCreate` | `features/council/` | Council creation form |
| `SessionView` | `features/session/` | Container — state management + SSE |
| `DebatePanel` | `features/session/` | Renders agent messages by round |
| `VotingPanel` | `features/session/` | Displays vote chips with confidence bars |
| `VerdictCard` | `features/session/` | Final verdict display |
| `HumanVoteForm` | `features/session/` | Human-in-loop vote submission |

### Not yet implemented

| Component | Purpose |
|-----------|---------|
| `AgentList` | List existing agents with edit/delete |
| `AgentCreate` | Form for creating agents (name, system prompt, model) |
| `HumanTurnInput` | Text input shown between rounds when `awaiting_human_turn` |
| `StartSessionDialog` | Material dialog to enter claim and launch session |
