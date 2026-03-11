# TODO — Ethora

> Tracked backlog of implementation work. Updated by Claude as work progresses.
> Items are grouped into parallelizable work units. Dependencies noted where they exist.
> See `SPEC.md` for the full API contract and SSE alignment details.

## Completed

- [x] **Implement `engine/council.py`** — Orchestrate rounds, collect messages, emit SSE events, trigger voting
- [x] **Implement `engine/agent.py`** — Call Claude API, pass system prompt + conversation history
- [x] **Implement `engine/voting.py`** — All four mechanisms: majority, weighted, consensus, human_in_loop
- [x] **Wire up SSE stream** (`sessions.py:stream_session`) — Connect engine to SSE event generator
- [x] **Implement human turn injection** (`sessions.py:submit_human_turn`) — Pause-resume flow
- [x] **Add `selectinload` to council list query** — Eager-load agents on `list_councils`
- [x] **Extract `get_or_404` helper** — Generic fetch-by-ID-or-404 in `deps.py`
- [x] **SSE endpoint DB session lifetime** — Dedicated DB session inside the stream generator
- [x] **Home page** — Landing page with project description and CTA
- [x] **Council list page** — Material card grid with links
- [x] **Council create form** — Reactive form for name, rounds, voting, agent selection
- [x] **Session view** — Multi-panel debate UI with agent messages, voting, verdict
- [x] **SSE integration in session view** — Subscribe to `SseService.connect()` and render events

---

## 1. SSE & Type Alignment (frontend)

> **Independent — no backend changes needed. Start here before other frontend work.**

- [x] **Add `awaiting_human_turn` to `SessionStatus` type** (`models.ts`) — Backend sends this status but frontend type doesn't include it
- [x] **Add `awaiting_human_turn` + `awaiting_human_vote` + `error` to `SSE_EVENTS`** (`sse.service.ts`) — Frontend doesn't listen for these backend events
- [x] **Handle `awaiting_human_turn` SSE event** (`session-view.ts`) — Replace `status` event handler with proper `awaiting_human_turn` case; set `waitingForHuman` signal
- [x] **Handle `awaiting_human_vote` SSE event** (`session-view.ts`) — Show human vote form when this event fires
- [x] **Handle `error` SSE event** (`session-view.ts`) — Set session status to `error` with message from backend
- [x] **Map `vote` → `value` in `voting_cast` handler** (`session-view.ts`) — Backend sends `vote` field, frontend `Vote` interface expects `value`
- [x] **Remove dead `status` event handling** (`session-view.ts`) — The generic `status` case is unreachable once specific events are handled

---

## 2. Human Turn Input (frontend)

> **Depends on: SSE & Type Alignment (section 1)**

- [x] **Create `HumanTurnInput` component** — Text area + submit button, shown between rounds when `awaiting_human_turn`
- [x] **Wire `HumanTurnInput` into `SessionView`** — Show when `sessionStatus === 'awaiting_human_turn'`, call `ApiService.sendHumanTurn()`
- [x] **Re-connect SSE after human turn submission** — After `POST /human-turn` returns 202, re-call `GET /stream` (session resets to `pending`)

---

## 3. Agent Creation UI (frontend)

> **Independent — can be worked in parallel with all other sections.**

- [x] **Create `AgentList` component** — Display agents in a Material table/card grid
- [x] **Create `AgentCreate` component** — Form with name, system prompt (textarea), model selector
- [x] **Add routes** — `/agents` → `AgentList`, `/agents/new` → `AgentCreate`
- [x] **Add nav link** — "Agents" item in toolbar navigation

---

## 4. Start Session Flow (frontend)

> **Independent — can be worked in parallel.**

- [x] **Create `StartSessionDialog`** — Material dialog with text input for the claim/question
- [x] **Add "Start Session" button to council cards** — On `CouncilList`, each card gets a button that opens the dialog
- [x] **Wire dialog → API → navigation** — `POST /sessions` with council_id + claim, then `router.navigate(['/sessions', id])`

---

## 5. Session View Hardening (frontend)

> **Depends on: SSE & Type Alignment (section 1)**

- [x] **Handle already-complete sessions** — If `GET /sessions/{id}` returns `status: 'complete'`, fetch verdict directly instead of opening SSE stream
- [x] **Status-aware initialization** — Check session status on load: `complete` → fetch verdict, `error` → show error, `awaiting_human_turn` → show human input, `pending` → connect SSE
- [x] **Display connection/loading state** — Show spinner or status indicator while SSE is connecting

---

## 6. Infrastructure

- [x] **Alembic migrations** — Replace `create_all()` with proper migration setup for production
- [x] **Pin Python dependency versions** in `requirements.txt`
- [x] **Add pagination** to `list_agents` and `list_councils` endpoints

---

## 7. Code Quality (deferred from codebase audit)

- [ ] **Replace global Anthropic client with DI** (`backend/app/engine/agent.py`) — Module-level singleton couples agent module to client lifecycle; use FastAPI dependency injection instead
- [ ] **Use SQLAlchemy Enum for status/voting fields** (`backend/app/models/models.py`) — `voting_mechanism` and `status` are plain `String` columns; convert to `Enum` type with migration for DB-level constraint
- [ ] **Global HTTP error interceptor** (frontend) — Each component handles errors independently; add centralized `HttpInterceptor` for consistent error handling
- [ ] **Centralized `SessionStateService`** (frontend) — Session state is managed inline in `SessionView`; extract to a dedicated service for reuse and testability
- [ ] **Optimize ORM eager loading** (`backend/app/models/models.py`) — All relationships use `lazy="selectin"` globally; profile and switch to `lazy="select"` where eager loading is unnecessary
- [ ] **Add tests for `ThemeService` and `app.routes.ts`** (frontend) — These files lack test coverage

---

## Phase 2 — Dependency Graph

```
Stream A (Prompts) ─────┬──→ Stream D (Open Voting)
                        └──→ Stream E (Dual Response)

Stream B (CRUD) ─────────────→ §17 Admin Dashboard
Stream C (Human Turn Fix) ──→ §16 Session History

Stream F (Tool Use) ─────┐
Stream G (File Upload) ──┼──→ Stream H (File Editing)
Stream D (Open Voting) ──┘

§16 Session History ─────┬──→ §17 Admin Dashboard
Stream B (CRUD) ─────────┘
```

**Can start in parallel (no deps):** A, B, C, F, G
**After Stream A:** D, E
**After Stream C:** §16 Session History
**After §16 + B:** §17 Admin Dashboard
**After D + F + G:** H

---

## 8. Stream A — System Prompt Extraction & Enhancement

> **Priority 1 · Depends on: nothing · Blocks: D, E**

- [x] Create `backend/app/engine/prompts/` directory with editable template files (`deliberation_system.txt`, `voting_prompt.txt`, `continuation_nudge.txt`)
- [x] Build prompt template loader with variable interpolation (agent name, council name, other agents, round count, voting mechanism)
- [x] Wrap each agent's `system_prompt` with deliberation framing ("You are in a deliberation council…", other agents, voting mechanism, rounds)
- [x] Update **`_build_voting_prompt`** in `council.py` to use template file instead of inline f-string
- [x] Update **`_build_agent_messages`** continuation nudge to use template

---

## 9. Stream B — Agent & Council CRUD (Edit + Delete)

> **Priority 1 · Depends on: nothing**

- [x] Add `PUT /api/v1/agents/{id}` — update agent (name, system_prompt, model) — **`councils.py`**
- [x] Add `DELETE /api/v1/agents/{id}` — cascade-remove from councils; fail 409 if any council would have <2 agents — **`councils.py`**
- [x] Add `PUT /api/v1/councils/{id}` — update council (name, rounds, voting_mechanism, allow_human_turns, agent_ids) — **`councils.py`**
- [x] Add `DELETE /api/v1/councils/{id}` — fail if active sessions exist — **`councils.py`**
- [x] Add `AgentUpdate` and `CouncilUpdate` Pydantic schemas — **`schemas.py`**
- [x] Frontend: edit pages for agents and councils (reuse create forms, pre-populate) — **`agent/`, `council/`**
- [x] Frontend: delete buttons with confirmation dialogs — **`agent-list/`, `council-list/`**
- [x] Frontend: routes `/agents/:id/edit`, `/councils/:id/edit` — **`app.routes.ts`**
- [x] Frontend: add edit/delete actions to list views — **`api.service.ts`**

---

## 10. Stream C — Fix Human Turn Mechanism

> **Priority 1 · Depends on: nothing**

**Reported symptoms:** errors on human input prompt; agent answers disappear on reload; voting panel appears prematurely.

- [x] Investigate: SSE stream errors when `awaiting_human_turn` fires — **`council.py`, `sessions.py`**
- [x] Add `GET /api/v1/sessions/{id}/messages` endpoint to fetch historical messages — **`sessions.py`**
- [x] Frontend: load existing messages/votes from API on session-view init before connecting SSE — **`session-view.ts`**
- [x] Fix SSE pause/resume flow — ensure stream doesn't error on human turn pause — **`council.py`**
- [x] Fix voting panel visibility — only show when status is `voting` or `complete` — **`session-view.ts`**
- [x] E2E test: human turns enabled → prompt → submit → rounds continue

---

## 11. Stream D — Open-Ended Voting

> **Priority 2 · Depends on: Stream A**

- [x] Add candidate proposal phase: after deliberation, agents propose candidate answers for open-ended questions — **`council.py`**
- [x] Collect and deduplicate candidates, present list to all agents for voting
- [x] Update voting prompt template: binary mode (`true`/`false`) vs open mode (vote on candidates) — **`prompts/voting_prompt.txt`**
- [x] Add `question_type: Literal["binary", "open"]` to **Session** schema (per-session, user picks at start) — **`schemas.py`, `models.py`**
- [x] Add SSE events: `candidate_proposed`, `candidates_finalized` — **`council.py`**
- [x] Frontend: update start-session dialog with question type picker — **`start-session-dialog/`**
- [x] Frontend: update voting panel to display candidates and open-ended results — **`voting-panel/`**

---

## 12. Stream E — Dual Response Format (Answer + Summary)

> **Priority 2 · Depends on: Stream A**

- [ ] Update system prompt template: instruct agents to end responses with `---SUMMARY---` block — **`prompts/deliberation_system.txt`**
- [ ] Parse agent responses to extract `content` and `summary` — **`council.py`**
- [ ] Add `summary: Mapped[str | None]` to `Message` model + Alembic migration — **`models.py`**
- [ ] Update SSE `agent_message` event to include `summary` field — **`council.py`**
- [ ] Update `MessageResponse` schema — **`schemas.py`**
- [ ] Frontend: show summary by default in debate panel cards, expand on hover/click — **`debate-panel/`**
- [ ] Frontend: update `Message` interface — **`models.ts`**

---

## 13. Stream F — Agent Tool Use

> **Priority 3 · Depends on: nothing · Blocks: H**

- [ ] Define tool schemas for Anthropic API `tools` parameter (start with `web_search`) — **`agent.py`**
- [ ] Update `call_agent()` to handle `tool_use` blocks: execute tools, send `tool_result`, loop until final text — **`agent.py`**
- [ ] Add `tools_enabled: Mapped[bool]` to Council model + migration — **`models.py`**
- [ ] Add `references` JSON column to `Message` model + migration — **`models.py`**
- [ ] Extract references (url, title, snippet) from `web_search` tool results and attach to agent message — **`agent.py`**
- [ ] Include `references` array in `agent_message` SSE event and `MessageResponse` schema — **`council.py`, `schemas.py`**
- [ ] Emit `tool_use` SSE events during tool execution — **`council.py`**
- [ ] Frontend: tool-use indicator in debate panel ("Searching the web…") — **`debate-panel/`**
- [ ] Frontend: render references as clickable citation links below agent messages — **`debate-panel/`**
- [ ] Frontend: toggle for tools in council create/edit form — **`council-create/`**

---

## 14. Stream G — File Upload for Context

> **Priority 3 · Depends on: nothing · Blocks: H**

- [ ] Add `POST /api/v1/sessions/{id}/files` — multipart upload, store under `uploads/{session_id}/` — new **`files.py`**
- [ ] Create `SessionFile` model (`id, session_id, filename, path, mime_type, size, created_at`) + migration — **`models.py`**
- [ ] Include file contents in agent context (text files inline, PDFs via `pypdf`) — **`council.py`**
- [ ] Frontend: file upload component in start-session dialog (drag-and-drop + picker) — **`start-session-dialog/`**
- [ ] Frontend: show uploaded files in session view header — **`session-view/`**
- [ ] Add support for links to resources aswell

---

## 15. Stream H — Collaborative File Editing Under Consensus

> **Priority 4 · Depends on: D + F + G**

- [ ] Add `file_edit` tool for agents to propose changes to uploaded files — **`agent.py`**
- [ ] Collect proposed edits, present to all agents for consensus voting — **`council.py`**
- [ ] Apply edits on consensus; track versions with `FileVersion` model — **`models.py`**
- [ ] Frontend: show file diffs in session view — **`session-view/`**
- [ ] Agents can add links to sources and reference them in their answers.

---

## 16. Session History & Recovery

> **Priority 2 · Depends on: Stream C (messages endpoint)**

### Backend

- [x] **Add `GET /api/v1/sessions` endpoint** — List all sessions with optional filters (`council_id`, `status`), ordered by `created_at` desc, paginated — **`sessions.py`**
- [x] **Implement `GET /api/v1/sessions/{id}/messages`** — Return all messages for a session grouped by round (already in SPEC, not yet implemented) — **`sessions.py`**
- [x] **Add `GET /api/v1/councils/{id}/sessions`** — List sessions for a specific council — **`councils.py`**
- [x] **Add `DELETE /api/v1/sessions/{id}`** — Delete a session and cascade to rounds/messages/votes/verdict — **`sessions.py`**
- [x] **Add `SessionListResponse` schema** with session metadata + council name + verdict summary (if complete) — **`schemas.py`**

### Frontend

- [x] **Create `SessionList` component** — Table view of past sessions with status badges (running/complete/error/awaiting input), council name, claim preview, date — **`features/session/session-list/`**
- [x] **Add `/sessions` route** — Wire `SessionList` into routing and toolbar nav — **`app.routes.ts`**
- [x] **Add `listSessions()` and `getMessages()` to `ApiService`** — **`api.service.ts`**
- [x] **Load historical messages on session-view init** — Before connecting SSE, call `GET /sessions/{id}/messages` to restore transcript on page reload or re-visit — **`session-view.ts`**
- [x] **Add "Recent Sessions" widget to Home page** — Show last 5 sessions with status and link — **`features/home/`**
- [x] **Add "View Sessions" link on council cards** — Navigate to `/sessions?council_id={id}` — **`council-list/`**
- [x] **Delete session action** — Delete button with confirmation dialog in session list — **`session-list/`**

---

## 17. Admin Dashboard

> **Priority 3 · Depends on: Stream B (CRUD), Session History (section 16)**

### Overview

- [ ] **Create `/admin` route and `AdminDashboard` component** — Top-level admin page with tabbed sections — **`features/admin/`**
- [ ] **Add "Admin" link to toolbar** — Visible in main navigation — **`app.component.ts`**

### Agent Management

- [ ] **Agent configuration panel** — Full CRUD for agents with inline editing of system prompts, model selection, and preview — **`features/admin/agents/`**
- [ ] **Agent test bench** — Send a test message to an agent and see the response without creating a session — **`features/admin/agents/`**
- [ ] **Agent templates library** — Pre-built agent personas (Devil's Advocate, Fact Checker, Synthesizer, etc.) that can be cloned — **`features/admin/agents/`**

### Tooling Configuration

- [ ] **Tool registry panel** — Enable/disable available tools (web search, file edit, etc.) per council — **`features/admin/tools/`**
- [ ] **API key management** — Configure and rotate LLM API keys from the UI (stored encrypted) — **`features/admin/settings/`**
- [ ] **Model configuration** — Set default model, temperature, max tokens per agent or council — **`features/admin/settings/`**

### Statistics & Monitoring

- [ ] **Session stats dashboard** — Total sessions, completion rate, avg rounds per session, sessions over time chart — **`features/admin/stats/`**
- [ ] **Council usage stats** — Most-used councils, sessions per council, avg deliberation time — **`features/admin/stats/`**
- [ ] **Agent performance metrics** — Response times, avg message length, voting alignment — **`features/admin/stats/`**
- [ ] **Backend stats endpoints** — `GET /api/v1/admin/stats/sessions`, `GET /api/v1/admin/stats/agents` — **`api/v1/admin.py`**
- [ ] **Error log viewer** — View recent session errors with stack traces and context — **`features/admin/logs/`**

---

## 18. Future

- [ ] **Fact Checker wrapper** — Preconfigured council with Source Critic, Logical Analyst, Devil's Advocate, Synthesizer agents
- [ ] **Graph visualization panel** — Deferred from PoC
