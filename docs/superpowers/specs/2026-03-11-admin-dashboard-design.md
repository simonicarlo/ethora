# Admin Dashboard — Design Spec

> Section 17 (partial): Overview + Agent Management only. Tooling Configuration and Statistics deferred.

## Scope

- Admin shell with sidebar navigation and child routes
- Agent management panel (master-detail with inline editing)
- Agent test bench (stateless LLM test endpoint)
- Agent templates (curated list + seed script)
- Replace existing standalone agent pages with admin panel
- Consistent with existing Ethora design language (Angular Material, existing theme)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Layout | Sidebar navigation | Distinct admin feel, scales to future sections |
| Agent panel | Master-detail split | Fast inline editing, no page navigation |
| Agent pages | Replace + redirect | Single source of truth, no role separation needed |
| Test bench backend | Lightweight stateless endpoint | No session overhead for quick prompt testing |
| Templates storage | Frontend constant + seed script | No schema changes, seed script for initial setup |

---

## 1. Admin Shell & Routing

### Route structure

| Route | Component | Description |
|-------|-----------|-------------|
| `/admin` | `AdminDashboard` | Shell with sidebar, redirects to `/admin/agents` |
| `/admin/agents` | `AgentConfig` | Agent master-detail panel |
| Future: `/admin/stats` | — | Statistics (deferred) |
| Future: `/admin/settings` | — | Settings (deferred) |

### Navigation changes

- **Toolbar**: "Agents" link points to `/admin/agents` instead of `/agents`. Add "Admin" link with `admin_panel_settings` icon.
- **Redirects**: `/agents` → `/admin/agents`. Remove `/agents/new` and `/agents/:id/edit` routes.
- **Removed components**: `AgentList`, `AgentForm` components deleted (functionality absorbed into admin).
- **SPEC.md update**: Replace `/agents`, `/agents/new`, `/agents/:id/edit` routes in the Frontend Navigation table with `/admin` and `/admin/agents`. Note `/agents` as a redirect.

### Sidebar

- Angular Material `mat-nav-list` in left pane
- Active link highlighted with `routerLinkActive`
- Links: "Agents" (active), "Statistics" (disabled), "Settings" (disabled)
- Sidebar is part of `AdminDashboard` component; content area uses `<router-outlet>` for child routes

### Component structure

```
features/admin/
├── admin-dashboard/          # Shell: sidebar + router-outlet
│   ├── admin-dashboard.ts
│   ├── admin-dashboard.html
│   └── admin-dashboard.scss
└── agents/
    ├── agent-config/         # Master-detail: list + tab content
    │   ├── agent-config.ts
    │   ├── agent-config.html
    │   └── agent-config.scss
    ├── agent-test-bench/     # Test message panel (used as tab content)
    │   ├── agent-test-bench.ts
    │   ├── agent-test-bench.html
    │   └── agent-test-bench.scss
    └── agent-templates/      # Template browser + clone (used as tab content)
        ├── agent-templates.ts
        ├── agent-templates.html
        ├── agent-templates.scss
        └── templates.data.ts # Curated template definitions
```

---

## 2. Agent Management Panel

### Master-Detail Layout

**Left pane (agent list):**
- Scrollable list of agent names
- Active agent highlighted (selected state)
- "+ New Agent" button at bottom
- Uses Angular Signals for selected agent state

**Right pane (tabbed content):**
- Three Material tabs: Configure, Test Bench, Templates
- Test Bench tab disabled when no agent is selected

### Configure Tab

- Reactive form: `name` (input), `system_prompt` (textarea), `model` (select)
- **Edit mode**: form pre-populated from selected agent. Save → `PUT /api/v1/agents/{id}`. Updates list in-place.
- **Create mode**: blank form when "+ New Agent" clicked. Save → `POST /api/v1/agents`. New agent added to list and selected.
- Delete button with `confirm()` dialog → `DELETE /api/v1/agents/{id}`. Selects next agent or clears selection.
- Selecting a different agent or clicking "+ New Agent" discards unsaved form changes without confirmation.
- All operations use existing `ApiService` methods — no new frontend API methods needed for CRUD.

### Test Bench Tab

- Text input for test message + "Send" button
- Response displayed below in a styled Material card
- Loading spinner during API call
- Calls `POST /api/v1/agents/{id}/test`

**New `ApiService` method:**
```typescript
testAgent(id: string, message: string): Observable<{ response: string }>
```

### Templates Tab

- Grid of template cards showing: name, description, system prompt preview (truncated)
- "Clone" button on each card → calls `ApiService.createAgent()` with template data → new agent appears in list and is selected. Clone failure displays an error message inline (consistent with existing CRUD error patterns).
- Templates defined in `templates.data.ts` as a TypeScript constant

**Template data shape (defined in `templates.data.ts`, not `models.ts` — frontend-only concept):**
```typescript
interface AgentTemplate {
  name: string;
  description: string;
  system_prompt: string;
  model: string;
}
```

**Initial templates:**
- Devil's Advocate — challenges assumptions, finds weaknesses
- Fact Checker — verifies claims against evidence
- Synthesizer — finds common ground, builds unified positions
- Source Critic — evaluates source credibility and bias
- Logical Analyst — identifies logical fallacies and reasoning gaps

---

## 3. Backend Changes

### New endpoint: Agent test

```
POST /api/v1/agents/{agent_id}/test
```

**Request body:**
```json
{ "message": "Is the earth flat?" }
```

**Response (200):**
```json
{ "response": "As a Devil's Advocate, I would argue..." }
```

**Error responses:**
- `404` — Agent not found: `{ "detail": "Agent not found" }`
- `502` — LLM call failed (rate limit, network, invalid model): `{ "detail": "LLM call failed: <reason>" }`
- Frontend displays errors inline in the response card area.

**Implementation:**
- Fetch agent from DB (404 if not found)
- Call Anthropic API with agent's `system_prompt` + `model` and the user's message
- Return the text response
- No DB writes, no session creation
- Add to existing `councils.py` router (where agent endpoints live)

**New Pydantic schemas:**
```python
class AgentTestRequest(BaseModel):
    message: str

class AgentTestResponse(BaseModel):
    response: str
```

### Seed script

**File:** `backend/scripts/seed_agents.py`

- Standalone script, imports SQLAlchemy models and database config
- Creates the 5 template agents (same data as frontend `templates.data.ts`)
- Idempotent: checks by name, skips existing agents
- Usage: `cd backend && python -m scripts.seed_agents`

---

## 4. Files Modified

### Frontend — New files
- `features/admin/admin-dashboard/admin-dashboard.{ts,html,scss}`
- `features/admin/agents/agent-config/agent-config.{ts,html,scss}`
- `features/admin/agents/agent-test-bench/agent-test-bench.{ts,html,scss}`
- `features/admin/agents/agent-templates/agent-templates.{ts,html,scss}`
- `features/admin/agents/agent-templates/templates.data.ts`

### Frontend — Modified files
- `app.routes.ts` — add `/admin` routes, redirect `/agents`, remove old agent routes
- `app.ts` / `app.html` — update toolbar nav links
- `core/api.service.ts` — add `testAgent()` method
- `SPEC.md` — update Frontend Navigation table with new admin routes

### Frontend — Deleted files
- `features/agent/agent-list/` — replaced by admin agent config
- `features/agent/agent-form/` — replaced by admin agent config

### Backend — New files
- `scripts/seed_agents.py`

### Backend — Modified files
- `api/v1/councils.py` — add `POST /agents/{id}/test` endpoint
- `schemas/schemas.py` — add `AgentTestRequest`, `AgentTestResponse`

---

## 5. Out of Scope

- Statistics & Monitoring (deferred)
- Tooling Configuration (deferred — depends on Stream F)
- API key management
- Error log viewer
- Role-based access control
