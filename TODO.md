# TODO — Ethora

> Tracked backlog of implementation work. Updated by Claude as work progresses.
> Items grouped by priority and area. See `REVIEW.md` for full audit details.
> See `SPEC.md` for API contracts and SSE alignment details.

## Completed Sections (collapsed)

Sections 1–6, 8–13, 16–17 from the original TODO are fully complete. See git history for details.

---

## 1. Critical Fixes

> **Priority 1 — Fix before any new feature work**

- [x] **Fix post-rollback session status update** — Re-fetch session via `db.get()` after rollback in generic error handler, matching the `RateLimitError` pattern — **`backend/app/engine/council.py:573-578`**
- [x] **Fix `as unknown as Vote` type cast** — Create a proper mapping function from `SseVotingCast` to `Vote` instead of double-casting through `unknown` (missing `id`, `agent_id`) — **`frontend/src/app/features/session/session-view/session-view.ts:434`**
- [x] **Validate admin settings keys** — Whitelist allowed setting keys in `PUT /api/v1/admin/settings/{key}` to prevent arbitrary key injection — **`backend/app/api/v1/admin.py:252-276`**

---

## 2. Security Hardening

> **Priority 1 — Required before any deployment**

- [x] **Add authentication to admin endpoints** — API key auth via `X-Admin-Key` header on all `/api/v1/admin/*` routes; skipped when `ADMIN_API_KEY` is empty (dev mode) — **`backend/app/api/v1/admin.py`**
- [x] **Mask API key in admin UI** — Show only last 4 characters (`****xxxx`) instead of first 4 — **`backend/app/api/v1/admin.py`**
- [x] **Require `SETTINGS_ENCRYPTION_KEY`** — Fail loudly on startup if encryption key is empty when encrypted settings exist in DB — **`backend/app/main.py`**
- [x] **Add `max_length` to all text input fields** — Added bounds to 7 Pydantic schema fields — **`backend/app/schemas/schemas.py`**
- [x] **Update `.env.example`** — Added `CORS_ORIGINS`, `MODERATOR_MODEL`, `SETTINGS_ENCRYPTION_KEY`, `ADMIN_API_KEY` — **`.env.example`**

---

## 3. Frontend Reliability

> **Priority 2 — Stability and correctness**

- [x] **Add `takeUntilDestroyed()` to unprotected subscriptions** — `session-view.ts:161,195,228`, `human-turn-input.ts:38`, `human-vote-form.ts:54`, `admin-settings.ts:93-126`, `agent-test-bench.ts:48`
- [x] **Add SSE reconnection with exponential backoff** — Currently SSE drops terminate the Observable with no recovery path — **`frontend/src/app/core/sse.service.ts`**
- [x] **Add wildcard 404 route** — No `{ path: '**' }` catch-all; invalid URLs show blank page — **`frontend/src/app/app.routes.ts`**
- [x] **Fix chart colors for light theme** — Hardcoded `rgba(255,255,255,...)` makes charts invisible on light theme — **`frontend/src/app/features/admin/stats/stats-dashboard.ts:51-64`**

---

## 4. Type Safety & Contracts

> **Priority 2 — Align frontend/backend types and fix SPEC drift**

- [x] **Update SPEC.md** — Added 6 missing SSE events (`agent_typing`, `summary_ready`, `voting_started`, `closing_statement`, `moderator_action`, `rate_limited`), 3 missing statuses (`proposing`, `closing_statements`, `rate_limited`), `research` question type, and updated `agent_message` shape
- [x] **Add `summary` field to frontend `Message` interface** — Added `summary?: string | null` to `Message` and `SseAgentMessage` — **`frontend/src/app/core/models.ts`**
- [x] **Fix `voting_cast` SSE field mismatch** — Standardized on `vote` field, removed `value?` workaround — **`models.ts`, `session-view.ts`**
- [x] **Remove `$any()` from templates** — Replaced with typed `getInputValue()` helper in `human-turn-input.ts`, `human-vote-form.ts`, `tool-registry.ts`
- [x] **Type `let row` in MatTable** — Already resolved by Angular 17+ strict template inference from typed `ErrorLogEntry[]` dataSource
- [x] **Use `Literal` type for `MessageWithContext.message_type`** — Added `MessageType = Literal[...]` — **`backend/app/schemas/schemas.py`**
- [x] **Add `SseVotingStarted` interface** — Added interface and typed cast in session-view — **`frontend/src/app/core/models.ts`**
- [x] **Replace `Any` usages with justified comments** — Added explicit `# Any:` comments to `agent.py`, `tools.py`, `emitter.py` explaining why `Any` is necessary (Anthropic SDK wire format)

---

## 5. Backend Code Quality

> **Priority 2 — Data integrity and robustness**

- [ ] **Use SQLAlchemy Enum for status/voting columns** — `voting_mechanism` and `status` are plain `String`; add DB-level constraint via migration — **`backend/app/models/models.py:45,61`**
- [ ] **Add ORM cascade deletes** — Add `cascade="all, delete-orphan"` to relationships and `ON DELETE CASCADE` to FKs; remove manual cascade in `sessions.py:248-261` — **`backend/app/models/models.py`**
- [ ] **Add FK indexes** — `Round.session_id`, `Message.round_id`, `Vote.session_id`, `Vote.agent_id` lack indexes (PostgreSQL doesn't auto-index FKs) — **`backend/app/models/models.py`**
- [ ] **Replace `assert` with proper guards** — `councils.py:158`, `council.py:566` — `assert` is stripped with `-O` flag
- [ ] **Narrow moderator exception handling** — `moderator.py:69,97,132,166` catch bare `except Exception`; use specific exceptions — **`backend/app/engine/moderator.py`**
- [ ] **Validate `council_id` exists on session creation** — Currently FK violation returns 500 instead of 404 — **`backend/app/api/v1/sessions.py:52-60`**
- [ ] **Return `SessionStateResponse` instance from `get_session_messages`** — Currently returns raw dict, bypassing Pydantic validation — **`backend/app/api/v1/sessions.py:111`**
- [ ] **Use `TallyResult` TypedDict for `tally_votes` return** — Currently `dict[str, str | float]` is too loose — **`backend/app/engine/voting.py:15`**
- [ ] **Replace global Anthropic client with DI** — Module-level singleton is not task-safe and ignores runtime key changes — **`backend/app/engine/agent.py:53-65`**

---

## 6. Code Duplication & Consistency

> **Priority 3 — Refactoring for maintainability**

- [ ] **Create SSE event constants module** — Replace 18+ hardcoded string literals with constants in `sse/events.py` — **`backend/app/engine/council.py`, `sessions.py`**
- [ ] **Extract `_system_prompt_for()` helper** — `render_deliberation_system()` called 4x with identical args at lines 210, 316, 408, 494 — **`backend/app/engine/council.py`**
- [ ] **Extract `_build_debate_text()` helper** — Identical 4-line block at lines 304-307 and 390-393 — **`backend/app/engine/council.py`**
- [ ] **Consolidate default icon constant** — `'smart_toy'` hardcoded in 10+ locations across both stacks; define `DEFAULT_AGENT_ICON` per stack — **multiple files**
- [ ] **Extract shared markdown styles** — Duplicated `::ng-deep` markdown CSS in `debate-panel.scss:190-200` and `session-view.scss:235-243`; create `_markdown.scss` mixin
- [ ] **Unify DI patterns** — Frontend: `human-turn-input.ts`, `human-vote-form.ts` use constructor injection while all others use `inject()`. Backend: `admin.py` uses raw `Depends(get_db)` while others use `DBSession` alias
- [ ] **Replace `confirm()` with `MatDialog`** — Browser `confirm()` in `council-list.ts:61`, `session-list.ts:99`, `agent-config.ts:141` is inconsistent with Material Design
- [ ] **Create shared `AgentChip` component** — Agent name+icon template pattern repeated in 4+ templates — **`frontend/src/app/shared/components/`**
- [ ] **Deduplicate `agentMap` computed signal** — Same map built independently in `session-view.ts` and `debate-panel.ts`; pass as input or extract utility

---

## 7. Test Coverage

> **Priority 3 — Fill gaps identified in review**

### Frontend (10 untested components)
- [ ] `admin-dashboard.ts`
- [ ] `agent-config.ts`
- [ ] `agent-test-bench.ts`
- [ ] `agent-templates.ts`
- [ ] `tool-registry.ts`
- [ ] `admin-settings.ts`
- [ ] `stats-dashboard.ts`
- [ ] `error-log-viewer.ts`
- [ ] `session-list.ts`
- [ ] `council-form.ts`
- [ ] **Create shared test fixtures** — Mock agent/council/session objects repeated in 6+ spec files; extract to `test-utils/fixtures.ts`

### Backend (untested modules)
- [ ] `app/engine/agent.py` — LLM client wrapper
- [ ] `app/engine/tools.py` — Tool schema definitions
- [ ] `app/core/config.py` — Settings loading

---

## 8. Infrastructure & DevOps

> **Priority 3 — Production readiness**

- [ ] **Add `restart: unless-stopped`** to all docker-compose services — **`docker-compose.yml`**
- [ ] **Deep health check** — Verify DB connectivity in `/health` endpoint — **`backend/app/main.py:72-74`**
- [ ] **Centralized logging** — Configure global log level, format, and handlers instead of ad-hoc `logging.getLogger()` per module
- [ ] **Update `pytest-asyncio`** — Pinned at extremely old `1.3.0` — **`backend/requirements.txt`**
- [ ] **Add request size limits** — No middleware for body size; `max_length` missing on several schema fields
- [ ] **Rename app title** — "Agent Council API" → "Ethora API" in OpenAPI docs — **`backend/app/main.py:51`**
- [ ] **Update stale CLAUDE.md files** — Engine and SSE CLAUDE.md files reference outdated event lists and `create_all()`

---

## 9. UX Polish

> **Priority 3 — Nice-to-haves**

- [ ] **Add `aria-label` attributes** — Delete buttons, icon-picker, mat-slider, menu triggers across multiple components
- [ ] **Remove `console.log/warn/error`** — Production debug logging in `session-view.ts:453,460,467`
- [ ] **Fix N+1 queries in admin stats** — `admin.py:108-129,149-168,207-216` issue per-entity queries; use joins or window functions
- [ ] **Consistent `delete_setting` response** — Returns `None` instead of `Response(status_code=204)` like other delete endpoints — **`backend/app/api/v1/admin.py:279-288`**
- [ ] **Move `import time` to module level** — Currently inside function body — **`backend/app/engine/agent.py:211`**

---

## 10. File Upload & Collaborative Editing (Feature)

> **Priority 4 — New features**

### File Upload (Stream G)
- [ ] Add `POST /api/v1/sessions/{id}/files` — multipart upload, store under `uploads/{session_id}/` — **`files.py`**
- [ ] Create `SessionFile` model + migration — **`models.py`**
- [ ] Include file contents in agent context — **`council.py`**
- [ ] Frontend: file upload component in start-session dialog — **`start-session-dialog/`**
- [ ] Frontend: show uploaded files in session view header — **`session-view/`**
- [ ] Add support for links to resources as well

### Collaborative File Editing (Stream H — depends on D + F + G)
- [ ] Add `file_edit` tool for agents — **`agent.py`**
- [ ] Collect proposed edits, consensus voting — **`council.py`**
- [ ] Apply edits on consensus; `FileVersion` model — **`models.py`**
- [ ] Frontend: show file diffs — **`session-view/`**
- [ ] Agents can add links to sources and reference them

---

## 11. Future

- [ ] **Fact Checker wrapper** — Preconfigured council with Source Critic, Logical Analyst, Devil's Advocate, Synthesizer agents
- [ ] **Graph visualization panel** — Deferred from PoC
- [ ] **Tool registry backend persistence** — Per-tool config requires a `tool_config` JSON column on councils
- [ ] **Frontend admin auth support** — Add `X-Admin-Key` header to admin API requests when `ADMIN_API_KEY` is configured (e.g., via HTTP interceptor or login prompt) — **`frontend/src/app/core/api.service.ts`**
