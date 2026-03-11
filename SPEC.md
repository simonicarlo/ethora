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
| `PUT`  | `/agents/{id}` | `AgentUpdate` | `AgentResponse` | 200 |
| `DELETE` | `/agents/{id}` | — | 204 | 204 |
| `POST` | `/agents/{id}/test` | `AgentTestRequest` | `AgentTestResponse` | 200 |

**AgentTestRequest**
```json
{ "message": "string" }
```
- `message`: min 1 char. Sent to the agent's LLM with its system prompt. Returns `{ "response": "string" }`.
- Errors: `404` agent not found, `502` LLM call failed.

**AgentCreate**
```json
{ "name": "string", "system_prompt": "string", "model?": "string" }
```
- `name`: 1–100 chars
- `system_prompt`: min 1 char
- `model`: defaults to `"claude-sonnet-4-20250514"`

**AgentUpdate** — all fields optional
```json
{ "name?": "string", "system_prompt?": "string", "model?": "string" }
```

**AgentResponse**
```json
{ "id": "uuid", "name": "string", "system_prompt": "string", "model": "string" }
```

**Delete behaviour**: Cascade-removes the agent from all councils. Returns **409** if removal would leave any council with fewer than 2 agents.

---

### Councils

| Method | Path | Request Body | Response | Status |
|--------|------|-------------|----------|--------|
| `POST` | `/councils` | `CouncilCreate` | `CouncilResponse` | 201 |
| `GET`  | `/councils` | — | `CouncilResponse[]` | 200 |
| `GET`  | `/councils/{id}` | — | `CouncilResponse` | 200 |
| `PUT`  | `/councils/{id}` | `CouncilUpdate` | `CouncilResponse` | 200 |
| `DELETE` | `/councils/{id}` | — | 204 | 204 |

**CouncilCreate**
```json
{
  "name": "string",
  "rounds?": 3,
  "voting_mechanism?": "majority",
  "allow_human_turns?": false,
  "tools_enabled?": false,
  "agent_ids": ["uuid", "uuid"]
}
```
- `rounds`: 1–20, default 3
- `voting_mechanism`: `"majority"` | `"weighted"` | `"consensus"` | `"human_in_loop"`
- `tools_enabled`: whether agents can use tools (web search, etc.)
- `agent_ids`: min 2 agents required

**CouncilUpdate** — all fields optional
```json
{
  "name?": "string",
  "rounds?": 3,
  "voting_mechanism?": "majority",
  "allow_human_turns?": false,
  "tools_enabled?": false,
  "agent_ids?": ["uuid", "uuid"]
}
```

**CouncilResponse**
```json
{
  "id": "uuid",
  "name": "string",
  "rounds": 3,
  "voting_mechanism": "majority",
  "allow_human_turns": false,
  "tools_enabled": false,
  "agents": [AgentResponse, ...]
}
```

**Delete behaviour**: Returns **409** if the council has active (non-complete, non-error) sessions.

---

### Sessions

| Method | Path | Request Body | Response | Status |
|--------|------|-------------|----------|--------|
| `POST` | `/sessions` | `SessionCreate` | `SessionResponse` | 201 |
| `GET`  | `/sessions/{id}` | — | `SessionResponse` | 200 |
| `GET`  | `/sessions/{id}/stream` | — | SSE stream | 200 |
| `GET`  | `/sessions/{id}/messages` | — | `MessageResponse[]` | 200 |
| `POST` | `/sessions/{id}/human-turn` | `HumanTurnRequest` | `{ "status": "accepted" }` | 202 |
| `POST` | `/sessions/{id}/human-vote` | `HumanVoteRequest` | `VerdictResponse` | 201 |
| `GET`  | `/sessions/{id}/verdict` | — | `VerdictResponse` | 200 |
| `POST` | `/sessions/{id}/files` | multipart file(s) | `SessionFileResponse[]` | 201 |

**SessionCreate**
```json
{ "council_id": "uuid", "input_claim": "string", "question_type?": "binary" }
```
- `question_type`: `"binary"` (default) | `"open"` — determines voting behaviour (see Voting Mechanisms)

**SessionResponse**
```json
{
  "id": "uuid",
  "council_id": "uuid",
  "input_claim": "string",
  "question_type": "binary",
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

**MessageResponse**
```json
{
  "id": "uuid",
  "round_id": "uuid",
  "agent_id": "uuid|null",
  "content": "string",
  "summary": "string|null",
  "references": [
    { "url": "string", "title": "string|null", "snippet": "string|null" }
  ],
  "created_at": "ISO-8601"
}
```
- `agent_id` is `null` for human-authored messages
- `summary` is a 1–2 sentence summary extracted from the agent's response (see Dual Response Format)
- `references` is a list of source links gathered from tool use (e.g., web search results); empty array if none

**SessionFileResponse**
```json
{
  "id": "uuid",
  "session_id": "uuid",
  "filename": "string",
  "mime_type": "string",
  "size": 12345,
  "created_at": "ISO-8601"
}
```

### Error responses

- **404** — Resource not found (`{ "detail": "Session not found" }`)
- **409** — State conflict (`{ "detail": "Session is 'running', expected 'pending'" }`)
- **409** — Delete blocked (`{ "detail": "Agent is the only remaining member of council 'X'" }`)

---

## SSE Event Contract

Stream URL: `GET /api/v1/sessions/{id}/stream`

Content type: `text/event-stream`

Precondition: session must be in `pending` status (returns 409 otherwise).

### Events emitted by the backend

| Event name | Data fields | When emitted |
|------------|-------------|-------------|
| `agent_message` | `agent_id`, `agent_name`, `round`, `content`, `summary`, `references` | After each agent completes its response |
| `round_complete` | `round` | After all agents in a round have responded |
| `awaiting_human_turn` | `round`, `message` | After a round when `allow_human_turns` is enabled (not last round) |
| `tool_use` | `agent_id`, `agent_name`, `tool_name`, `tool_input` | When an agent invokes a tool (e.g., web search) |
| `candidate_proposed` | `agent_id`, `agent_name`, `candidates` | When an agent proposes candidate answers (open-ended voting) |
| `candidates_finalized` | `candidates` | After all candidates are collected and deduplicated |
| `voting_cast` | `agent_id`, `agent_name`, `vote`, `confidence`, `reasoning` | After each agent casts a vote |
| `awaiting_human_vote` | `message` | When `human_in_loop` voting is used (instead of auto-tally) |
| `verdict` | `decision`, `confidence`, `summary` | Final verdict rendered |
| `error` | `message` | On engine failure |

### Wire format

Each event is formatted as:
```
event: <event_name>\ndata: <json>\n\n
```

### Frontend SSE event list

The frontend `SseService` must listen for all events in the table above: `agent_message`, `round_complete`, `awaiting_human_turn`, `tool_use`, `candidate_proposed`, `candidates_finalized`, `voting_cast`, `awaiting_human_vote`, `verdict`, `error`.

### Phase 1 alignment gaps (resolved)

These were identified in Phase 1 and have been fixed:
- ~~Human turn pause: Frontend now listens for `awaiting_human_turn`~~
- ~~Human vote wait: Frontend now listens for `awaiting_human_vote`~~
- ~~Error event: Added to SSE_EVENTS~~
- ~~Session status type: `awaiting_human_turn` added~~
- ~~Vote field naming: `vote` → `value` mapping added~~

### Phase 2 alignment work needed

| Area | Change needed |
|------|--------------|
| New SSE events | Frontend must handle `tool_use`, `candidate_proposed`, `candidates_finalized` |
| `agent_message` shape | Now includes `summary` field — frontend must parse and display |
| Session creation | `question_type` field added to `SessionCreate` |
| Historical messages | New `GET /sessions/{id}/messages` endpoint — frontend must load on init to survive page reloads |

---

## Voting Mechanisms

| Mechanism | Behaviour | Verdict source |
|-----------|-----------|---------------|
| `majority` | Simple count — most common value wins | Auto (engine) |
| `weighted` | Sum confidence per value — highest weighted value wins | Auto (engine) |
| `consensus` | All agents must agree; returns `no_consensus` otherwise | Auto (engine) |
| `human_in_loop` | Agents vote, then engine raises `HumanVoteRequired`; UI shows form, human submits via `POST /human-vote` | Human |

### Question types

The `question_type` field on `Session` determines how voting works:

| Type | Behaviour |
|------|-----------|
| `binary` | Agents vote `"true"` or `"false"` on the input claim (default, current behaviour) |
| `open` | Agents first propose candidate answers, then vote on the deduplicated candidate list |

**Open-ended voting flow:**
1. After deliberation rounds complete, each agent proposes 1–3 candidate answers (`candidate_proposed` SSE event)
2. Engine deduplicates/normalizes candidates (`candidates_finalized` SSE event)
3. Agents vote on the candidate list — `value` must be one of the finalized candidates
4. Standard voting mechanism (majority/weighted/consensus/human) applies to the candidate votes

### Vote shape (from agents)

**Binary mode**: `{ "value": "true"|"false", "confidence": 0.0-1.0, "reasoning": "..." }`

**Open mode**: `{ "value": "<candidate>", "confidence": 0.0-1.0, "reasoning": "..." }`

Fallback on parse failure: `{ "value": "abstain", "confidence": 0.0, "reasoning": "<raw text>" }`

---

## Frontend Navigation

| Route | Component | Purpose |
|-------|-----------|---------|
| `/` | `Home` | Landing page with hero text and CTA |
| `/councils` | `CouncilList` | Card grid of existing councils |
| `/councils/new` | `CouncilCreate` | Form to create a council (select existing agents) |
| `/councils/:id/edit` | `CouncilEdit` | Form to edit a council |
| `/admin` | `AdminDashboard` | Admin shell with sidebar navigation |
| `/admin/agents` | `AgentConfig` | Agent management (master-detail panel) |
| `/agents` | _(redirect)_ | Redirects to `/admin/agents` |
| `/sessions/:id` | `SessionView` | Live debate view with panels |

### Navigation flow for starting a session

1. User navigates to `/councils`
2. Clicks a council card → opens a "Start Session" dialog
3. User enters the input claim (debate topic)
4. User selects question type: `binary` or `open`
5. Optionally uploads context files (drag-and-drop or file picker)
6. `POST /sessions` → receives `SessionResponse` with `id`
7. If files were selected: `POST /sessions/{id}/files` (multipart upload)
8. Navigate to `/sessions/{id}`
9. `SessionView` calls `GET /sessions/{id}/messages` to load any existing state (supports page reload)
10. `SessionView` calls `GET /sessions/{id}/stream` → SSE begins

---

## UI Component Inventory

### Implemented

| Component | Location | Purpose |
|-----------|----------|---------|
| `Home` | `features/home/` | Landing page |
| `CouncilList` | `features/council/` | Council card grid with start-session + edit/delete |
| `CouncilCreate` | `features/council/` | Council creation form |
| `AgentList` | `features/agent/` | Agent card grid with edit/delete |
| `AgentCreate` | `features/agent/` | Agent creation form |
| `SessionView` | `features/session/` | Container — state management + SSE |
| `DebatePanel` | `features/session/` | Renders agent messages by round |
| `VotingPanel` | `features/session/` | Displays vote chips with confidence bars |
| `VerdictCard` | `features/session/` | Final verdict display |
| `HumanTurnInput` | `features/session/` | Text input shown between rounds |
| `HumanVoteForm` | `features/session/` | Human-in-loop vote submission |
| `StartSessionDialog` | `features/session/` | Material dialog to enter claim and launch session |

### Not yet implemented (Phase 2)

| Component | Purpose |
|-----------|---------|
| `AgentEdit` | Form for editing agents (reuses create form, pre-populated) |
| `CouncilEdit` | Form for editing councils (reuses create form, pre-populated) |
| `FileUpload` | Drag-and-drop + file picker for session context files |
| `ToolUseIndicator` | Inline indicator when an agent is using a tool (e.g., "Searching…") |

---

## Dual Response Format

Agents return two parts in every response: a **full answer** and a **short summary**.

### Prompt instruction

The system prompt template instructs agents to end every response with:
```
---SUMMARY---
A 1-2 sentence summary of your position.
```

### Backend parsing

The engine parses the `---SUMMARY---` delimiter:
- Everything before → `content` (full analysis)
- Everything after → `summary` (1–2 sentences)
- If no delimiter found → `content` = full text, `summary` = `null`

### Frontend display

- **Default**: message cards show the `summary` text
- **Expand**: hover or click reveals the full `content`
- **Fallback**: if `summary` is null, show full content as before

---

## System Prompt Templates

Prompts are extracted from inline Python code into editable template files at `backend/app/engine/prompts/`.

### Template files

| File | Purpose | Variables |
|------|---------|-----------|
| `deliberation_system.txt` | Wraps agent's custom prompt with deliberation context | `{council_name}`, `{agent_name}`, `{agent_list}`, `{voting_mechanism}`, `{rounds}`, `{agent_system_prompt}` |
| `voting_prompt.txt` | Asks agent to cast a vote after deliberation | `{input_claim}`, `{debate_text}`, `{question_type}`, `{candidates}` |
| `continuation_nudge.txt` | Injected when agent needs to continue discussion | (none) |

### Deliberation framing

Every agent receives a system prompt that includes:
- Council name and purpose
- List of all other agents in the council
- Voting mechanism being used
- Total number of rounds
- The agent's own custom role/personality prompt

This gives agents awareness of the deliberation structure they're participating in.

---

## Agent Tool Use

When `tools_enabled` is true on a council, agents can use tools during deliberation.

### Available tools

| Tool | Description |
|------|-------------|
| `web_search` | Search the internet for information |

### Tool execution flow

1. Agent's Claude API call includes `tools` parameter with tool definitions
2. If response contains `tool_use` content blocks, engine executes the tool
3. Tool results are sent back as `tool_result` messages
4. Loop continues until agent produces a final text response
5. Each tool invocation emits a `tool_use` SSE event

### References and citations

When agents use tools like `web_search`, the engine captures structured references from tool results and attaches them to the agent's message.

**Reference shape:**
```json
{ "url": "string", "title": "string|null", "snippet": "string|null" }
```

- `url`: the source URL from the tool result
- `title`: page title or result heading (if available)
- `snippet`: short excerpt or description from the source

**How references work:**
1. During tool execution, the engine extracts URLs, titles, and snippets from tool results (e.g., web search hits)
2. References are stored as a JSON array on the `Message` model (`references` column)
3. Agents are encouraged (via system prompt) to cite sources inline using numbered markers (e.g., `[1]`, `[2]`) that correspond to the references array
4. The `agent_message` SSE event and `MessageResponse` both include the `references` array

### Frontend display

- While an agent is using tools, the debate panel shows an activity indicator (e.g., "Searching the web…")
- References are rendered as clickable citation links below the agent's message
- Inline citation markers (e.g., `[1]`) can be linked to the corresponding reference
- Tool results may optionally be shown inline (e.g., search result snippets)

---

## File Upload

Users can upload files to provide context to a deliberation session.

### Storage

- Files stored on disk at `uploads/{session_id}/{filename}`
- Metadata tracked in `SessionFile` model: `id`, `session_id`, `filename`, `path`, `mime_type`, `size`, `created_at`

### Context injection

- **Text files** (`.txt`, `.md`, `.csv`, `.json`, etc.): content appended to the agent's context
- **PDFs**: text extracted via `pypdf` and injected as context
- File content is presented to agents as part of the deliberation context, not as separate tool calls

### Upload timing

- Files can be uploaded when creating a session (via `StartSessionDialog`)
- Upload endpoint: `POST /api/v1/sessions/{id}/files` (multipart)

---

## Collaborative File Editing (Phase 2, future)

Agents can propose and apply edits to uploaded files when consensus is reached.

- Requires: tool use (Stream F) + file upload (Stream G) + open-ended voting (Stream D)
- Agents use a `file_edit` tool to propose changes
- Edits are voted on using the consensus mechanism
- File versions are tracked (`FileVersion` model)
- Frontend shows diffs between versions
