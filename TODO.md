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

- [ ] **Create `StartSessionDialog`** — Material dialog with text input for the claim/question
- [ ] **Add "Start Session" button to council cards** — On `CouncilList`, each card gets a button that opens the dialog
- [ ] **Wire dialog → API → navigation** — `POST /sessions` with council_id + claim, then `router.navigate(['/sessions', id])`

---

## 5. Session View Hardening (frontend)

> **Depends on: SSE & Type Alignment (section 1)**

- [ ] **Handle already-complete sessions** — If `GET /sessions/{id}` returns `status: 'complete'`, fetch verdict directly instead of opening SSE stream
- [ ] **Status-aware initialization** — Check session status on load: `complete` → fetch verdict, `error` → show error, `awaiting_human_turn` → show human input, `pending` → connect SSE
- [ ] **Display connection/loading state** — Show spinner or status indicator while SSE is connecting

---

## 6. Infrastructure

- [ ] **Alembic migrations** — Replace `create_all()` with proper migration setup for production
- [ ] **Pin Python dependency versions** in `requirements.txt`
- [ ] **Add pagination** to `list_agents` and `list_councils` endpoints

---

## 7. Future (Phase 2)

- [ ] **Fact Checker wrapper** — Preconfigured council with Source Critic, Logical Analyst, Devil's Advocate, Synthesizer agents
- [ ] **Graph visualization panel** — Deferred from PoC
