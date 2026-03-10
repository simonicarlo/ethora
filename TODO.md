# TODO — Agent Council

> Tracked backlog of implementation work. Updated by Claude as work progresses.
> Items are grouped by area and ordered roughly by priority within each group.

## Engine (core deliberation logic)

- [x] **Implement `engine/council.py`** — Orchestrate rounds: loop through agents sequentially per round, collect messages, emit SSE events, trigger voting after final round
- [x] **Implement `engine/agent.py`** — Call Claude API via `anthropic` SDK, pass system prompt + conversation history, return completed response
- [x] **Implement `engine/voting.py`** — Implement all four mechanisms: `majority`, `weighted`, `consensus`, `human_in_loop`

## Backend API

- [x] **Wire up SSE stream** (`sessions.py:stream_session`) — Connect `run_council_session` to the SSE event generator so real deliberation events flow to the client
- [ ] **Implement human turn injection** (`sessions.py:submit_human_turn`) — Store human message in current round, signal the engine to continue
- [ ] **Add `selectinload` to council list query** — `list_councils` relies on lazy="selectin" default which causes N+1; add explicit `options(selectinload(Council.agents))`
- [ ] **Extract `get_or_404` helper** — Repeated fetch-by-ID-or-404 pattern in `sessions.py` (3x) and `councils.py` (1x); extract to `deps.py`
- [x] **SSE endpoint DB session lifetime** — `stream_session` holds a DB connection for the entire stream duration; refactor to use short-lived sessions inside the generator

## Frontend UI

- [x] **Home page** — Landing page with project description and "Start" CTA
- [ ] **Council list page** — Display councils in a Material card grid, link to create
- [x] **Council create form** — Reactive form for name, rounds, voting mechanism, agent selection
- [ ] **Session view** — Multi-panel debate UI: agent message cards per round, voting results, verdict display *(partial: voting panel, human vote form, verdict card done; debate message panel still pending)*
- [x] **SSE integration in session view** — Subscribe to `SseService.connect()` and render events in real time

## Infrastructure

- [ ] **Alembic migrations** — Replace `create_all()` with proper migration setup for production
- [ ] **Pin Python dependency versions** in `requirements.txt`
- [ ] **Add pagination** to `list_agents` and `list_councils` endpoints

## Future (Phase 2)

- [ ] **Fact Checker wrapper** — Preconfigured council with Source Critic, Logical Analyst, Devil's Advocate, Synthesizer agents
- [ ] **Graph visualization panel** — Deferred from PoC
