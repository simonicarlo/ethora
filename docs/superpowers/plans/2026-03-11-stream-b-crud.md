# Stream B — Agent & Council CRUD (Edit + Delete) Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add update and delete endpoints for agents and councils, plus frontend edit/delete UI with shared form components.

**Architecture:** Backend adds 4 new endpoints (PUT/DELETE for agents and councils) with validation (409 on constraint violations). Frontend refactors create components into shared form components that handle both create and edit modes, adds delete buttons to list views, and adds edit routes.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy async, Angular 21, Angular Material, Signals

---

## Chunk 1: Backend — Schemas and Agent Endpoints

### Task 1: Add AgentUpdate and CouncilUpdate Pydantic schemas

**Files:**
- Modify: `backend/app/schemas/schemas.py:15-18` (after AgentCreate)

- [ ] **Step 1: Write failing test for AgentUpdate schema validation**

```python
# backend/tests/test_schemas.py — append to file

from app.schemas.schemas import AgentUpdate, CouncilUpdate

class TestAgentUpdateSchema:
    def test_all_fields_optional(self) -> None:
        update = AgentUpdate()
        assert update.name is None
        assert update.system_prompt is None
        assert update.model is None

    def test_partial_update(self) -> None:
        update = AgentUpdate(name="New Name")
        assert update.name == "New Name"
        assert update.system_prompt is None

    def test_name_validation(self) -> None:
        import pytest
        with pytest.raises(Exception):
            AgentUpdate(name="")


class TestCouncilUpdateSchema:
    def test_all_fields_optional(self) -> None:
        update = CouncilUpdate()
        assert update.name is None

    def test_partial_update(self) -> None:
        update = CouncilUpdate(name="New Name", rounds=5)
        assert update.name == "New Name"
        assert update.rounds == 5

    def test_agent_ids_min_length(self) -> None:
        import pytest
        with pytest.raises(Exception):
            CouncilUpdate(agent_ids=["one-id"])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_schemas.py::TestAgentUpdateSchema -v`
Expected: ImportError — `AgentUpdate` does not exist yet

- [ ] **Step 3: Add AgentUpdate and CouncilUpdate schemas**

In `backend/app/schemas/schemas.py`, after `AgentCreate` (line 18), add:

```python
class AgentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    system_prompt: str | None = Field(default=None, min_length=1)
    model: str | None = None
```

After `CouncilCreate` (line 37), add:

```python
class CouncilUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    rounds: int | None = Field(default=None, ge=1, le=20)
    voting_mechanism: VotingMechanism | None = None
    allow_human_turns: bool | None = None
    agent_ids: list[uuid.UUID] | None = Field(default=None, min_length=2)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_schemas.py -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/schemas.py backend/tests/test_schemas.py
git commit -m "feat: add AgentUpdate and CouncilUpdate Pydantic schemas"
```

---

### Task 2: Add PUT /api/v1/agents/{id} endpoint

**Files:**
- Modify: `backend/app/api/v1/councils.py:11` (add imports), append after `list_agents`
- Modify: `backend/app/schemas/schemas.py` (export AgentUpdate)

- [ ] **Step 1: Write failing test for update agent**

```python
# backend/tests/test_api_councils.py — add to TestAgentEndpoints class

    async def test_update_agent(self, client: AsyncClient) -> None:
        create_resp = await client.post(
            "/api/v1/agents",
            json={"name": "Original", "system_prompt": "Original prompt."},
        )
        agent_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/v1/agents/{agent_id}",
            json={"name": "Updated"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated"
        assert resp.json()["system_prompt"] == "Original prompt."

    async def test_update_agent_not_found(self, client: AsyncClient) -> None:
        resp = await client.put(
            f"/api/v1/agents/{uuid.uuid4()}",
            json={"name": "Ghost"},
        )
        assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestAgentEndpoints::test_update_agent -v`
Expected: 405 Method Not Allowed (endpoint doesn't exist)

- [ ] **Step 3: Implement PUT /agents/{id} endpoint**

In `backend/app/api/v1/councils.py`:

1. Update import line 11 to include `AgentUpdate`:
```python
from app.schemas.schemas import AgentCreate, AgentResponse, AgentUpdate, CouncilCreate, CouncilResponse
```

2. After the `list_agents` endpoint (line 35), add:
```python
@router.put("/agents/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: uuid.UUID, payload: AgentUpdate, db: DBSession) -> Agent:
    agent = await get_or_404(db, Agent, agent_id, "Agent not found")
    if payload.name is not None:
        agent.name = payload.name
    if payload.system_prompt is not None:
        agent.system_prompt = payload.system_prompt
    if payload.model is not None:
        agent.model = payload.model
    await db.flush()
    return agent
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestAgentEndpoints -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/councils.py backend/tests/test_api_councils.py
git commit -m "feat: add PUT /agents/{id} endpoint for agent updates"
```

---

### Task 3: Add DELETE /api/v1/agents/{id} endpoint

**Files:**
- Modify: `backend/app/api/v1/councils.py` (add endpoint + import `func` from sqlalchemy)
- Modify: `backend/app/models/models.py` (no changes needed — council_agents table already exists)

- [ ] **Step 1: Write failing tests for delete agent**

```python
# backend/tests/test_api_councils.py — add to TestAgentEndpoints class

    async def test_delete_agent(self, client: AsyncClient) -> None:
        create_resp = await client.post(
            "/api/v1/agents",
            json={"name": "Doomed", "system_prompt": "Goodbye."},
        )
        agent_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/v1/agents/{agent_id}")
        assert resp.status_code == 204

        # Verify it's gone
        resp = await client.get("/api/v1/agents")
        names = [a["name"] for a in resp.json()]
        assert "Doomed" not in names

    async def test_delete_agent_not_found(self, client: AsyncClient) -> None:
        resp = await client.delete(f"/api/v1/agents/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_delete_agent_blocked_by_council(self, client: AsyncClient, two_agents: list[str]) -> None:
        """Deleting an agent that would leave a council with <2 agents returns 409."""
        # Create council with exactly 2 agents
        await client.post(
            "/api/v1/councils",
            json={"name": "Tight Council", "agent_ids": two_agents},
        )
        # Try deleting one — should fail with 409
        resp = await client.delete(f"/api/v1/agents/{two_agents[0]}")
        assert resp.status_code == 409

    async def test_delete_agent_cascade_from_council(self, client: AsyncClient) -> None:
        """Deleting an agent from a council with 3+ agents succeeds and removes the association."""
        ids = []
        for name in ("A", "B", "C"):
            r = await client.post(
                "/api/v1/agents",
                json={"name": name, "system_prompt": f"I am {name}."},
            )
            ids.append(r.json()["id"])

        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Big Council", "agent_ids": ids},
        )
        council_id = create_resp.json()["id"]

        # Delete one agent — council still has 2, so should succeed
        resp = await client.delete(f"/api/v1/agents/{ids[0]}")
        assert resp.status_code == 204

        # Verify council now has 2 agents
        council_resp = await client.get(f"/api/v1/councils/{council_id}")
        assert len(council_resp.json()["agents"]) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestAgentEndpoints::test_delete_agent -v`
Expected: 405 Method Not Allowed

- [ ] **Step 3: Implement DELETE /agents/{id} endpoint**

In `backend/app/api/v1/councils.py`:

1. Add `func` to sqlalchemy imports:
```python
from sqlalchemy import func, select
```

2. Add `Response` to fastapi imports:
```python
from fastapi import APIRouter, HTTPException, Query, Response
```

3. After the `update_agent` endpoint, add:
```python
@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(agent_id: uuid.UUID, db: DBSession) -> Response:
    agent = await get_or_404(db, Agent, agent_id, "Agent not found")

    # Check if removing this agent would leave any council with <2 agents
    count_query = (
        select(council_agents.c.council_id, func.count().label("agent_count"))
        .where(council_agents.c.council_id.in_(
            select(council_agents.c.council_id).where(council_agents.c.agent_id == agent_id)
        ))
        .group_by(council_agents.c.council_id)
        .having(func.count() <= 2)
    )
    result = await db.execute(count_query)
    blocking_councils = result.all()

    if blocking_councils:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete agent: removal would leave a council with fewer than 2 agents",
        )

    # Remove from council_agents associations
    await db.execute(council_agents.delete().where(council_agents.c.agent_id == agent_id))
    await db.delete(agent)
    await db.flush()
    return Response(status_code=204)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestAgentEndpoints -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/councils.py backend/tests/test_api_councils.py
git commit -m "feat: add DELETE /agents/{id} with council constraint check"
```

---

## Chunk 2: Backend — Council Update and Delete Endpoints

### Task 4: Add PUT /api/v1/councils/{id} endpoint

**Files:**
- Modify: `backend/app/api/v1/councils.py` (add import for CouncilUpdate, add endpoint)

- [ ] **Step 1: Write failing tests for update council**

```python
# backend/tests/test_api_councils.py — add to TestCouncilEndpoints class

    async def test_update_council_name(self, client: AsyncClient, two_agents: list[str]) -> None:
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Old Name", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/v1/councils/{council_id}",
            json={"name": "New Name"},
        )
        assert resp.status_code == 200
        assert resp.json()["name"] == "New Name"
        assert resp.json()["rounds"] == 3  # unchanged default

    async def test_update_council_agents(self, client: AsyncClient) -> None:
        """Swapping agent_ids updates the council's agent list."""
        ids = []
        for name in ("X", "Y", "Z"):
            r = await client.post(
                "/api/v1/agents",
                json={"name": name, "system_prompt": f"I am {name}."},
            )
            ids.append(r.json()["id"])

        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Swap Council", "agent_ids": ids[:2]},
        )
        council_id = create_resp.json()["id"]

        # Swap to agents Y and Z
        resp = await client.put(
            f"/api/v1/councils/{council_id}",
            json={"agent_ids": ids[1:]},
        )
        assert resp.status_code == 200
        agent_names = sorted(a["name"] for a in resp.json()["agents"])
        assert agent_names == ["Y", "Z"]

    async def test_update_council_not_found(self, client: AsyncClient) -> None:
        resp = await client.put(
            f"/api/v1/councils/{uuid.uuid4()}",
            json={"name": "Ghost"},
        )
        assert resp.status_code == 404

    async def test_update_council_invalid_agents(self, client: AsyncClient, two_agents: list[str]) -> None:
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Council", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]

        resp = await client.put(
            f"/api/v1/councils/{council_id}",
            json={"agent_ids": [str(uuid.uuid4()), str(uuid.uuid4())]},
        )
        assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestCouncilEndpoints::test_update_council_name -v`
Expected: 405 Method Not Allowed

- [ ] **Step 3: Implement PUT /councils/{id} endpoint**

In `backend/app/api/v1/councils.py`:

1. Update schema imports to include `CouncilUpdate`:
```python
from app.schemas.schemas import AgentCreate, AgentResponse, AgentUpdate, CouncilCreate, CouncilResponse, CouncilUpdate
```

2. After `get_council` endpoint, add:
```python
@router.put("/councils/{council_id}", response_model=CouncilResponse)
async def update_council(council_id: uuid.UUID, payload: CouncilUpdate, db: DBSession) -> Council:
    council = await get_or_404(db, Council, council_id, "Council not found")

    if payload.name is not None:
        council.name = payload.name
    if payload.rounds is not None:
        council.rounds = payload.rounds
    if payload.voting_mechanism is not None:
        council.voting_mechanism = payload.voting_mechanism
    if payload.allow_human_turns is not None:
        council.allow_human_turns = payload.allow_human_turns

    if payload.agent_ids is not None:
        result = await db.execute(select(Agent).where(Agent.id.in_(payload.agent_ids)))
        agents = list(result.scalars().all())
        if len(agents) != len(payload.agent_ids):
            raise HTTPException(status_code=404, detail="One or more agents not found")
        council.agents = agents

    await db.flush()
    return council
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestCouncilEndpoints -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/councils.py backend/tests/test_api_councils.py
git commit -m "feat: add PUT /councils/{id} endpoint for council updates"
```

---

### Task 5: Add DELETE /api/v1/councils/{id} endpoint

**Files:**
- Modify: `backend/app/api/v1/councils.py` (add endpoint)
- Modify: `backend/app/models/models.py` (no changes — Session already has council_id FK)

- [ ] **Step 1: Write failing tests for delete council**

```python
# backend/tests/test_api_councils.py — add to TestCouncilEndpoints class

    async def test_delete_council(self, client: AsyncClient, two_agents: list[str]) -> None:
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Deletable", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]

        resp = await client.delete(f"/api/v1/councils/{council_id}")
        assert resp.status_code == 204

        # Verify it's gone
        resp = await client.get(f"/api/v1/councils/{council_id}")
        assert resp.status_code == 404

    async def test_delete_council_not_found(self, client: AsyncClient) -> None:
        resp = await client.delete(f"/api/v1/councils/{uuid.uuid4()}")
        assert resp.status_code == 404

    async def test_delete_council_blocked_by_active_session(self, client: AsyncClient, two_agents: list[str]) -> None:
        """Deleting a council with active sessions returns 409."""
        create_resp = await client.post(
            "/api/v1/councils",
            json={"name": "Active Council", "agent_ids": two_agents},
        )
        council_id = create_resp.json()["id"]

        # Create an active session (status defaults to 'pending')
        await client.post(
            "/api/v1/sessions",
            json={"council_id": council_id, "input_claim": "Test claim"},
        )

        resp = await client.delete(f"/api/v1/councils/{council_id}")
        assert resp.status_code == 409
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestCouncilEndpoints::test_delete_council -v`
Expected: 405 Method Not Allowed

- [ ] **Step 3: Implement DELETE /councils/{id} endpoint**

In `backend/app/api/v1/councils.py`, add import for `Session` model:

```python
from app.models.models import Agent, Council, Session, council_agents
```

After `update_council` endpoint, add:
```python
@router.delete("/councils/{council_id}", status_code=204)
async def delete_council(council_id: uuid.UUID, db: DBSession) -> Response:
    council = await get_or_404(db, Council, council_id, "Council not found")

    # Check for active sessions (not complete or error)
    active_query = select(func.count()).select_from(Session).where(
        Session.council_id == council_id,
        Session.status.notin_(["complete", "error"]),
    )
    result = await db.execute(active_query)
    active_count = result.scalar_one()

    if active_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete council: it has active sessions",
        )

    # Remove council_agents associations, then the council
    await db.execute(council_agents.delete().where(council_agents.c.council_id == council_id))
    await db.delete(council)
    await db.flush()
    return Response(status_code=204)
```

- [ ] **Step 4: Run all backend tests to verify everything passes**

Run: `cd backend && python -m pytest tests/test_api_councils.py -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/councils.py backend/tests/test_api_councils.py
git commit -m "feat: add DELETE /councils/{id} with active-session constraint"
```

- [ ] **Step 6: Run full backend test suite**

Run: `cd backend && python -m pytest -v`
Expected: All tests pass

---

## Chunk 3: Frontend — Models, API Service, and Routes

### Task 6: Add frontend TypeScript types and API methods

**Files:**
- Modify: `frontend/src/app/core/models.ts:8-12` (add AgentUpdate, CouncilUpdate)
- Modify: `frontend/src/app/core/api.service.ts:13,55-57` (add imports + methods)

- [ ] **Step 1: Add AgentUpdate and CouncilUpdate interfaces to models.ts**

In `frontend/src/app/core/models.ts`, after `AgentCreate` (line 12), add:

```typescript
export type AgentUpdate = Partial<AgentCreate>;
```

After `CouncilCreate` (line 29), add:

```typescript
export type CouncilUpdate = Partial<CouncilCreate>;
```

- [ ] **Step 2: Add API methods to api.service.ts**

In `frontend/src/app/core/api.service.ts`:

1. Update imports (line 5-13) to include `AgentUpdate` and `CouncilUpdate`:
```typescript
import {
  Agent,
  AgentCreate,
  AgentUpdate,
  Council,
  CouncilCreate,
  CouncilUpdate,
  Session,
  SessionCreate,
  Verdict,
} from './models';
```

2. After `createAgent` method (line 57), add:
```typescript
  getAgent(id: string): Observable<Agent> {
    return this.get<Agent>(`/agents/${id}`);
  }

  updateAgent(id: string, data: AgentUpdate): Observable<Agent> {
    return this.put<Agent>(`/agents/${id}`, data);
  }

  deleteAgent(id: string): Observable<void> {
    return this.delete<void>(`/agents/${id}`);
  }
```

3. After `createCouncil` method (line 49), add:
```typescript
  updateCouncil(id: string, data: CouncilUpdate): Observable<Council> {
    return this.put<Council>(`/councils/${id}`, data);
  }

  deleteCouncil(id: string): Observable<void> {
    return this.delete<void>(`/councils/${id}`);
  }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/models.ts frontend/src/app/core/api.service.ts
git commit -m "feat: add update/delete types and API methods for agents and councils"
```

---

### Task 7: Update routes for edit pages

**Files:**
- Modify: `frontend/src/app/app.routes.ts`

- [ ] **Step 1: Add edit routes**

In `frontend/src/app/app.routes.ts`, add routes for edit pages. The `agents/:id/edit` route must come BEFORE `agents/new` doesn't matter since Angular matches by specificity, but place them logically after the create routes:

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home/home').then(m => m.Home) },
  { path: 'councils', loadComponent: () => import('./features/council/council-list/council-list').then(m => m.CouncilList) },
  { path: 'councils/new', loadComponent: () => import('./features/council/council-form/council-form').then(m => m.CouncilForm) },
  { path: 'councils/:id/edit', loadComponent: () => import('./features/council/council-form/council-form').then(m => m.CouncilForm) },
  { path: 'agents', loadComponent: () => import('./features/agent/agent-list/agent-list').then(m => m.AgentList) },
  { path: 'agents/new', loadComponent: () => import('./features/agent/agent-form/agent-form').then(m => m.AgentForm) },
  { path: 'agents/:id/edit', loadComponent: () => import('./features/agent/agent-form/agent-form').then(m => m.AgentForm) },
  { path: 'sessions/:id', loadComponent: () => import('./features/session/session-view/session-view').then(m => m.SessionView) },
];
```

Note: The actual component files will be created in Tasks 8 and 9 by renaming the existing create components.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/app.routes.ts
git commit -m "feat: add edit routes for agents and councils"
```

---

## Chunk 4: Frontend — Shared Agent Form Component

### Task 8: Refactor AgentCreate → AgentForm (shared create/edit)

**Files:**
- Rename: `frontend/src/app/features/agent/agent-create/` → `frontend/src/app/features/agent/agent-form/`
- Rename files inside: `agent-create.ts` → `agent-form.ts`, `agent-create.html` → `agent-form.html`, `agent-create.scss` → `agent-form.scss`

- [ ] **Step 1: Rename directory and files**

```bash
cd frontend/src/app/features/agent
mv agent-create agent-form
cd agent-form
mv agent-create.ts agent-form.ts
mv agent-create.html agent-form.html
mv agent-create.scss agent-form.scss
```

- [ ] **Step 2: Rewrite agent-form.ts with create/edit mode**

Replace contents of `frontend/src/app/features/agent/agent-form/agent-form.ts`:

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ApiService } from '../../../core/api.service';

@Component({
  selector: 'app-agent-form',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './agent-form.html',
  styleUrl: './agent-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentForm implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly submitting = signal(false);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEditMode = signal(false);

  private agentId: string | null = null;

  readonly modelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ] as const;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    system_prompt: ['', Validators.required],
    model: ['claude-sonnet-4-20250514'],
  });

  ngOnInit(): void {
    this.agentId = this.route.snapshot.paramMap.get('id');
    if (this.agentId) {
      this.isEditMode.set(true);
      this.loading.set(true);
      this.api.getAgent(this.agentId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (agent) => {
          this.form.patchValue({
            name: agent.name,
            system_prompt: agent.system_prompt,
            model: agent.model,
          });
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load agent');
          this.loading.set(false);
        },
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;

    this.submitting.set(true);
    this.error.set(null);

    const request$ = this.isEditMode()
      ? this.api.updateAgent(this.agentId!, this.form.getRawValue())
      : this.api.createAgent(this.form.getRawValue());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.router.navigate(['/agents']);
      },
      error: (err) => {
        const action = this.isEditMode() ? 'update' : 'create';
        this.error.set(err?.error?.detail ?? `Failed to ${action} agent`);
        this.submitting.set(false);
      },
    });
  }
}
```

- [ ] **Step 3: Update agent-form.html template**

Replace contents of `frontend/src/app/features/agent/agent-form/agent-form.html`:

```html
<div class="page-header">
  <h1>{{ isEditMode() ? 'Edit Agent' : 'Create Agent' }}</h1>
</div>

@if (loading()) {
  <div class="center">
    <mat-spinner diameter="48"></mat-spinner>
  </div>
} @else {
  <mat-card appearance="outlined" class="form-card">
    <mat-card-content>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Agent Name</mat-label>
          <input matInput formControlName="name" placeholder="e.g. Devil's Advocate">
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>System Prompt</mat-label>
          <textarea matInput formControlName="system_prompt" rows="6"
            placeholder="Describe this agent's role, personality, and expertise..."></textarea>
        </mat-form-field>

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Model</mat-label>
          <mat-select formControlName="model">
            @for (opt of modelOptions; track opt.value) {
              <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        @if (error()) {
          <p class="error-text">{{ error() }}</p>
        }

        <div class="form-actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || submitting()">
            @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              {{ isEditMode() ? 'Save Changes' : 'Create Agent' }}
            }
          </button>
        </div>
      </form>
    </mat-card-content>
  </mat-card>
}
```

- [ ] **Step 4: Update agent-form.scss**

Add the `.center` style to `frontend/src/app/features/agent/agent-form/agent-form.scss` (append before closing):

```scss
.center {
  display: flex;
  justify-content: center;
  padding: $space-6;
}
```

- [ ] **Step 5: Delete old agent-create spec file if it exists**

```bash
rm -f frontend/src/app/features/agent/agent-form/agent-create.spec.ts
```

- [ ] **Step 6: Verify the frontend compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds

- [ ] **Step 7: Commit**

```bash
git add -A frontend/src/app/features/agent/
git commit -m "refactor: rename AgentCreate → AgentForm with create/edit mode support"
```

---

## Chunk 5: Frontend — Shared Council Form Component

### Task 9: Refactor CouncilCreate → CouncilForm (shared create/edit)

**Files:**
- Rename: `frontend/src/app/features/council/council-create/` → `frontend/src/app/features/council/council-form/`
- Rename files inside: `council-create.ts` → `council-form.ts`, `council-create.html` → `council-form.html`, `council-create.scss` → `council-form.scss`

- [ ] **Step 1: Rename directory and files**

```bash
cd frontend/src/app/features/council
mv council-create council-form
cd council-form
mv council-create.ts council-form.ts
mv council-create.html council-form.html
mv council-create.scss council-form.scss
```

- [ ] **Step 2: Rewrite council-form.ts with create/edit mode**

Replace contents of `frontend/src/app/features/council/council-form/council-form.ts`:

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';

import { ApiService } from '../../../core/api.service';
import { Agent, VotingMechanism } from '../../../core/models';

@Component({
  selector: 'app-council-form',
  imports: [
    SlicePipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
  templateUrl: './council-form.html',
  styleUrl: './council-form.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CouncilForm implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly agents = signal<Agent[]>([]);
  readonly loadingAgents = signal(true);
  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly isEditMode = signal(false);

  private councilId: string | null = null;

  readonly votingMechanisms: { value: VotingMechanism; label: string }[] = [
    { value: 'majority', label: 'Majority' },
    { value: 'weighted', label: 'Weighted' },
    { value: 'consensus', label: 'Consensus' },
    { value: 'human_in_loop', label: 'Human in the Loop' },
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    rounds: [3, [Validators.required, Validators.min(1), Validators.max(20)]],
    voting_mechanism: ['majority' as VotingMechanism, Validators.required],
    allow_human_turns: [false],
    agent_ids: [[] as string[], Validators.required],
  });

  constructor() {
    this.api.getAgents().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (agents) => {
        this.agents.set(agents);
        this.loadingAgents.set(false);
      },
      error: () => {
        this.error.set('Failed to load agents');
        this.loadingAgents.set(false);
      },
    });
  }

  ngOnInit(): void {
    this.councilId = this.route.snapshot.paramMap.get('id');
    if (this.councilId) {
      this.isEditMode.set(true);
      this.loading.set(true);
      this.api.getCouncil(this.councilId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: (council) => {
          this.form.patchValue({
            name: council.name,
            rounds: council.rounds,
            voting_mechanism: council.voting_mechanism,
            allow_human_turns: council.allow_human_turns,
            agent_ids: council.agents.map(a => a.id),
          });
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load council');
          this.loading.set(false);
        },
      });
    }
  }

  onSubmit(): void {
    if (this.form.invalid || this.submitting()) return;

    const agentIds = this.form.getRawValue().agent_ids;
    if (agentIds.length < 2) {
      this.error.set('Select at least 2 agents for a council');
      return;
    }

    this.submitting.set(true);
    this.error.set(null);

    const request$ = this.isEditMode()
      ? this.api.updateCouncil(this.councilId!, this.form.getRawValue())
      : this.api.createCouncil(this.form.getRawValue());

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.router.navigate(['/councils']);
      },
      error: (err) => {
        const action = this.isEditMode() ? 'update' : 'create';
        this.error.set(err?.error?.detail ?? `Failed to ${action} council`);
        this.submitting.set(false);
      },
    });
  }
}
```

- [ ] **Step 3: Update council-form.html template**

Replace contents of `frontend/src/app/features/council/council-form/council-form.html`:

```html
<div class="page-header">
  <h1>{{ isEditMode() ? 'Edit Council' : 'Create Council' }}</h1>
</div>

@if (loading()) {
  <div class="center">
    <mat-spinner diameter="48"></mat-spinner>
  </div>
} @else {
  <mat-card appearance="outlined" class="form-card">
    <mat-card-content>
      <form [formGroup]="form" (ngSubmit)="onSubmit()">

        <mat-form-field appearance="outline" class="full-width">
          <mat-label>Council Name</mat-label>
          <input matInput formControlName="name" placeholder="e.g. Fact Checker Board">
        </mat-form-field>

        <div class="form-row">
          <mat-form-field appearance="outline">
            <mat-label>Rounds</mat-label>
            <input matInput type="number" formControlName="rounds" min="1" max="20">
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Voting Mechanism</mat-label>
            <mat-select formControlName="voting_mechanism">
              @for (vm of votingMechanisms; track vm.value) {
                <mat-option [value]="vm.value">{{ vm.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        </div>

        <mat-checkbox formControlName="allow_human_turns" class="human-turns-checkbox">
          Allow human turns between rounds
        </mat-checkbox>

        <h3 class="agents-heading">Agents</h3>

        @if (loadingAgents()) {
          <div class="center">
            <mat-spinner diameter="32"></mat-spinner>
          </div>
        } @else if (agents().length === 0) {
          <p class="no-agents">No agents available. Create agents first.</p>
        } @else {
          <mat-selection-list formControlName="agent_ids">
            @for (agent of agents(); track agent.id) {
              <mat-list-option [value]="agent.id">
                <span matListItemTitle>{{ agent.name }}</span>
                <span matListItemLine class="agent-prompt">{{ agent.system_prompt | slice:0:100 }}{{ agent.system_prompt.length > 100 ? '...' : '' }}</span>
              </mat-list-option>
            }
          </mat-selection-list>
        }

        @if (error()) {
          <p class="error-text">{{ error() }}</p>
        }

        <div class="form-actions">
          <button mat-flat-button type="submit" [disabled]="form.invalid || submitting()">
            @if (submitting()) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              {{ isEditMode() ? 'Save Changes' : 'Create Council' }}
            }
          </button>
        </div>
      </form>
    </mat-card-content>
  </mat-card>
}
```

- [ ] **Step 4: Delete old council-create spec file if it exists**

```bash
rm -f frontend/src/app/features/council/council-form/council-create.spec.ts
```

- [ ] **Step 5: Verify the frontend compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds

- [ ] **Step 6: Commit**

```bash
git add -A frontend/src/app/features/council/
git commit -m "refactor: rename CouncilCreate → CouncilForm with create/edit mode support"
```

---

## Chunk 6: Frontend — Edit/Delete Actions on List Views

### Task 10: Add edit and delete buttons to AgentList

**Files:**
- Modify: `frontend/src/app/features/agent/agent-list/agent-list.ts`
- Modify: `frontend/src/app/features/agent/agent-list/agent-list.html`

- [ ] **Step 1: Add delete method to agent-list.ts**

In `frontend/src/app/features/agent/agent-list/agent-list.ts`:

1. Add `ApiService` inject is already there. Add Router import:
```typescript
import { Router, RouterLink } from '@angular/router';
```

2. Add inject:
```typescript
  private readonly router = inject(Router);
```

3. Add delete method after the constructor:
```typescript
  deleteAgent(agent: Agent): void {
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;

    this.api.deleteAgent(agent.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.agents.update(agents => agents.filter(a => a.id !== agent.id));
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to delete agent');
      },
    });
  }
```

- [ ] **Step 2: Update agent-list.html with edit/delete buttons**

In `frontend/src/app/features/agent/agent-list/agent-list.html`, replace the `<mat-card>` block for each agent (lines 27-36) with:

```html
      <mat-card class="agent-card" appearance="outlined">
        <mat-card-header>
          <mat-icon matCardAvatar>smart_toy</mat-icon>
          <mat-card-title>{{ agent.name }}</mat-card-title>
          <mat-card-subtitle>{{ agent.model }}</mat-card-subtitle>
        </mat-card-header>
        <mat-card-content>
          <p class="prompt-preview">{{ agent.system_prompt }}</p>
        </mat-card-content>
        <mat-card-actions>
          <a mat-button [routerLink]="['/agents', agent.id, 'edit']">
            <mat-icon>edit</mat-icon>
            Edit
          </a>
          <button mat-button color="warn" (click)="deleteAgent(agent)">
            <mat-icon>delete</mat-icon>
            Delete
          </button>
        </mat-card-actions>
      </mat-card>
```

- [ ] **Step 3: Verify the frontend compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/agent/agent-list/
git commit -m "feat: add edit and delete buttons to agent list"
```

---

### Task 11: Add edit and delete buttons to CouncilList

**Files:**
- Modify: `frontend/src/app/features/council/council-list/council-list.ts`
- Modify: `frontend/src/app/features/council/council-list/council-list.html`

- [ ] **Step 1: Add delete method to council-list.ts**

In `frontend/src/app/features/council/council-list/council-list.ts`, add delete method after `startSession`:

```typescript
  deleteCouncil(council: Council): void {
    if (!confirm(`Delete council "${council.name}"? This cannot be undone.`)) return;

    this.api.deleteCouncil(council.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.councils.update(councils => councils.filter(c => c.id !== council.id));
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to delete council');
      },
    });
  }
```

- [ ] **Step 2: Update council-list.html with edit/delete buttons**

In `frontend/src/app/features/council/council-list/council-list.html`, update the `<mat-card-actions>` section (lines 51-56) to include edit and delete buttons alongside the Start Session button:

```html
        <mat-card-actions>
          <button mat-flat-button data-testid="start-session-btn" (click)="startSession(council)">
            <mat-icon>play_arrow</mat-icon>
            Start Session
          </button>
          <a mat-button [routerLink]="['/councils', council.id, 'edit']">
            <mat-icon>edit</mat-icon>
            Edit
          </a>
          <button mat-button color="warn" (click)="deleteCouncil(council)">
            <mat-icon>delete</mat-icon>
            Delete
          </button>
        </mat-card-actions>
```

- [ ] **Step 3: Verify the frontend compiles**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/council/council-list/
git commit -m "feat: add edit and delete buttons to council list"
```

---

### Task 12: Add GET /api/v1/agents/{id} backend endpoint

The frontend `AgentForm` in edit mode calls `getAgent(id)`, but the backend only has `GET /agents` (list). We need a single-agent fetch endpoint.

**Files:**
- Modify: `backend/app/api/v1/councils.py` (add endpoint after list_agents)

- [ ] **Step 1: Write failing test**

```python
# backend/tests/test_api_councils.py — add to TestAgentEndpoints class

    async def test_get_agent(self, client: AsyncClient) -> None:
        create_resp = await client.post(
            "/api/v1/agents",
            json={"name": "Fetchable", "system_prompt": "I can be fetched."},
        )
        agent_id = create_resp.json()["id"]

        resp = await client.get(f"/api/v1/agents/{agent_id}")
        assert resp.status_code == 200
        assert resp.json()["name"] == "Fetchable"

    async def test_get_agent_not_found(self, client: AsyncClient) -> None:
        resp = await client.get(f"/api/v1/agents/{uuid.uuid4()}")
        assert resp.status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestAgentEndpoints::test_get_agent -v`
Expected: 404 or 405

- [ ] **Step 3: Implement GET /agents/{id} endpoint**

In `backend/app/api/v1/councils.py`, after `list_agents` (and before `update_agent`), add:

```python
@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: uuid.UUID, db: DBSession) -> Agent:
    return await get_or_404(db, Agent, agent_id, "Agent not found")
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_api_councils.py::TestAgentEndpoints -v`
Expected: All pass

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/councils.py backend/tests/test_api_councils.py
git commit -m "feat: add GET /agents/{id} endpoint"
```

---

### Task 13: Run full test suites and update TODO.md

- [ ] **Step 1: Run full backend tests**

Run: `cd backend && python -m pytest -v`
Expected: All pass

- [ ] **Step 2: Run full frontend build**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | tail -5`
Expected: Build succeeds

- [ ] **Step 3: Run frontend tests**

Run: `cd frontend && npx ng test --watch=false 2>&1 | tail -20`
Expected: Tests pass (some may need updates due to renamed components)

- [ ] **Step 4: Fix any failing frontend tests**

If tests reference `AgentCreate` or `CouncilCreate` component names, update them to `AgentForm` / `CouncilForm`.

- [ ] **Step 5: Update TODO.md — check off Stream B items**

In `TODO.md`, check off all items under `## 9. Stream B`:
```markdown
- [x] Add `PUT /api/v1/agents/{id}` ...
- [x] Add `DELETE /api/v1/agents/{id}` ...
- [x] Add `PUT /api/v1/councils/{id}` ...
- [x] Add `DELETE /api/v1/councils/{id}` ...
- [x] Add `AgentUpdate` and `CouncilUpdate` Pydantic schemas ...
- [x] Frontend: edit pages for agents and councils ...
- [x] Frontend: delete buttons with confirmation dialogs ...
- [x] Frontend: routes `/agents/:id/edit`, `/councils/:id/edit` ...
- [x] Frontend: add edit/delete actions to list views ...
```

- [ ] **Step 6: Commit**

```bash
git add TODO.md
git commit -m "docs: mark Stream B items as complete in TODO.md"
```
