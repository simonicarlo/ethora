# Admin Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin dashboard with sidebar navigation and master-detail agent management panel, replacing the standalone agent pages.

**Architecture:** Sidebar-based admin shell at `/admin` with child routes. Agent management uses a master-detail layout with inline editing, a test bench for live LLM testing, and a templates gallery. The existing `/agents` routes redirect to `/admin/agents`, and standalone agent components are deleted.

**Tech Stack:** Angular 17+ (standalone components, Signals, Angular Material), FastAPI, Anthropic Python SDK, SQLAlchemy

---

## Chunk 1: Backend — Test Endpoint & Seed Script

### Task 1: Agent Test Endpoint — Backend Schemas

**Files:**
- Modify: `backend/app/schemas/schemas.py:153-167` (append after `HumanVoteRequest`)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/api/test_agent_test.py`:

```python
from __future__ import annotations

import uuid
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient


@pytest.fixture()
async def agent_id(client: AsyncClient) -> str:
    resp = await client.post(
        "/api/v1/agents",
        json={"name": "Test Agent", "system_prompt": "You are helpful."},
    )
    assert resp.status_code == 201
    return resp.json()["id"]


class TestAgentTestEndpoint:
    async def test_test_agent_success(self, client: AsyncClient, agent_id: str) -> None:
        with patch("app.api.v1.councils.call_agent", new_callable=AsyncMock) as mock_call:
            mock_call.return_value = "I am a helpful response."
            resp = await client.post(
                f"/api/v1/agents/{agent_id}/test",
                json={"message": "Hello, who are you?"},
            )
        assert resp.status_code == 200
        body = resp.json()
        assert body["response"] == "I am a helpful response."

    async def test_test_agent_not_found(self, client: AsyncClient) -> None:
        resp = await client.post(
            f"/api/v1/agents/{uuid.uuid4()}/test",
            json={"message": "Hello"},
        )
        assert resp.status_code == 404

    async def test_test_agent_empty_message(self, client: AsyncClient, agent_id: str) -> None:
        resp = await client.post(
            f"/api/v1/agents/{agent_id}/test",
            json={"message": ""},
        )
        assert resp.status_code == 422

    async def test_test_agent_llm_failure(self, client: AsyncClient, agent_id: str) -> None:
        with patch("app.api.v1.councils.call_agent", new_callable=AsyncMock) as mock_call:
            mock_call.side_effect = RuntimeError("Rate limit exceeded")
            resp = await client.post(
                f"/api/v1/agents/{agent_id}/test",
                json={"message": "Hello"},
            )
        assert resp.status_code == 502
        assert "Rate limit exceeded" in resp.json()["detail"]
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && python -m pytest tests/api/test_agent_test.py -v`
Expected: FAIL — `AgentTestRequest` and endpoint don't exist yet

- [ ] **Step 3: Add Pydantic schemas**

Add to `backend/app/schemas/schemas.py` after the `HumanVoteRequest` class:

```python
# -- Agent Test ---------------------------------------------------------------

class AgentTestRequest(BaseModel):
    message: str = Field(min_length=1)


class AgentTestResponse(BaseModel):
    response: str
```

- [ ] **Step 4: Add the endpoint to councils.py**

Add import at top of `backend/app/api/v1/councils.py`:

```python
from app.engine.agent import call_agent
from app.schemas.schemas import (
    AgentCreate,
    AgentResponse,
    AgentUpdate,
    AgentTestRequest,
    AgentTestResponse,
    CouncilCreate,
    CouncilResponse,
    CouncilUpdate,
    SessionListItem,
)
```

Add the endpoint after `delete_agent` (after line 86) and before the Councils section:

```python
@router.post("/agents/{agent_id}/test", response_model=AgentTestResponse)
async def test_agent(agent_id: uuid.UUID, payload: AgentTestRequest, db: DBSession) -> AgentTestResponse:
    agent = await get_or_404(db, Agent, agent_id, "Agent not found")
    try:
        response_text = await call_agent(
            agent=agent,
            messages=[{"role": "user", "content": payload.message}],
            system_prompt=agent.system_prompt,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}") from exc
    return AgentTestResponse(response=response_text)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/api/test_agent_test.py -v`
Expected: All 4 tests PASS

- [ ] **Step 6: Run full backend test suite**

Run: `./test-backend.sh`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```
git add backend/app/schemas/schemas.py backend/app/api/v1/councils.py backend/tests/api/test_agent_test.py
git commit -m "feat: add POST /agents/{id}/test endpoint for agent test bench"
```

---

### Task 2: Seed Script

**Files:**
- Create: `backend/scripts/__init__.py`
- Create: `backend/scripts/seed_agents.py`

- [ ] **Step 1: Create the scripts package**

Create `backend/scripts/__init__.py` (empty file).

- [ ] **Step 2: Write the seed script**

Create `backend/scripts/seed_agents.py`:

```python
"""Seed the database with pre-built agent templates.

Usage:
    cd backend && python -m scripts.seed_agents

Idempotent — skips agents that already exist (matched by name).
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.core.database import async_session_factory, engine, Base
from app.models.models import Agent

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

TEMPLATES: list[dict[str, str]] = [
    {
        "name": "Devil's Advocate",
        "system_prompt": (
            "You are the Devil's Advocate. Your role is to challenge assumptions, "
            "question consensus, and expose weaknesses in arguments. You push back "
            "on ideas that seem too easy or unexamined, forcing the group to defend "
            "their positions rigorously. You are not contrarian for its own sake — "
            "you genuinely want the strongest possible conclusion to emerge."
        ),
        "model": "claude-sonnet-4-20250514",
    },
    {
        "name": "Fact Checker",
        "system_prompt": (
            "You are the Fact Checker. Your role is to verify claims against known "
            "evidence, flag unsupported assertions, and demand sources. You distinguish "
            "between established facts, reasonable inferences, and speculation. You are "
            "precise and methodical, and you never let a dubious claim pass unchallenged."
        ),
        "model": "claude-sonnet-4-20250514",
    },
    {
        "name": "Synthesizer",
        "system_prompt": (
            "You are the Synthesizer. Your role is to find common ground between "
            "divergent viewpoints, identify shared premises, and build unified positions. "
            "You look for the strongest elements in each argument and weave them into a "
            "coherent whole. You are diplomatic but intellectually honest — you won't "
            "paper over genuine disagreements."
        ),
        "model": "claude-sonnet-4-20250514",
    },
    {
        "name": "Source Critic",
        "system_prompt": (
            "You are the Source Critic. Your role is to evaluate the credibility and "
            "bias of sources, evidence, and reasoning. You assess whether claims are "
            "well-supported, whether sources are reliable, and whether reasoning is "
            "logically sound. You are skeptical but fair — you acknowledge strong "
            "evidence when you see it."
        ),
        "model": "claude-sonnet-4-20250514",
    },
    {
        "name": "Logical Analyst",
        "system_prompt": (
            "You are the Logical Analyst. Your role is to identify logical fallacies, "
            "reasoning gaps, and structural weaknesses in arguments. You evaluate whether "
            "conclusions follow from premises, flag circular reasoning, and test arguments "
            "against edge cases. You are precise and systematic in your analysis."
        ),
        "model": "claude-sonnet-4-20250514",
    },
]


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        result = await session.execute(select(Agent.name))
        existing_names = {row[0] for row in result.all()}

        created = 0
        for template in TEMPLATES:
            if template["name"] in existing_names:
                logger.info("Skipping '%s' — already exists", template["name"])
                continue
            agent = Agent(
                name=template["name"],
                system_prompt=template["system_prompt"],
                model=template["model"],
            )
            session.add(agent)
            created += 1
            logger.info("Created agent '%s'", template["name"])

        await session.commit()
        logger.info("Done — %d agents created, %d skipped", created, len(TEMPLATES) - created)


if __name__ == "__main__":
    asyncio.run(seed())
```

- [ ] **Step 3: Verify the script runs (dry run against file-based SQLite)**

Run: `cd backend && DATABASE_URL=sqlite+aiosqlite:///tmp/seed_test.db ANTHROPIC_API_KEY=test-key python -m scripts.seed_agents`
Expected: "Created agent 'Devil's Advocate'" x5, "Done — 5 agents created, 0 skipped"

- [ ] **Step 4: Verify idempotency (run again against same DB)**

Run: `cd backend && DATABASE_URL=sqlite+aiosqlite:///tmp/seed_test.db ANTHROPIC_API_KEY=test-key python -m scripts.seed_agents`
Expected: "Skipping 'Devil's Advocate' — already exists" x5, "Done — 0 agents created, 5 skipped"

- [ ] **Step 4b: Clean up test DB**

Run: `rm -f /tmp/seed_test.db`

- [ ] **Step 5: Commit**

```
git add backend/scripts/__init__.py backend/scripts/seed_agents.py
git commit -m "feat: add seed script for pre-built agent templates"
```

---

## Chunk 2: Frontend — Admin Shell & Routing

### Task 3: Admin Dashboard Shell Component

**Files:**
- Create: `frontend/src/app/features/admin/admin-dashboard/admin-dashboard.ts`
- Create: `frontend/src/app/features/admin/admin-dashboard/admin-dashboard.html`
- Create: `frontend/src/app/features/admin/admin-dashboard/admin-dashboard.scss`

- [ ] **Step 1: Create the admin dashboard component**

Create `frontend/src/app/features/admin/admin-dashboard/admin-dashboard.ts`:

```typescript
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';

@Component({
  selector: 'app-admin-dashboard',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, MatIconModule, MatListModule],
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminDashboard {}
```

Create `frontend/src/app/features/admin/admin-dashboard/admin-dashboard.html`:

```html
<div class="admin-layout">
  <aside class="admin-sidebar">
    <h2 class="sidebar-title">Admin</h2>
    <mat-nav-list>
      <a mat-list-item routerLink="/admin/agents" routerLinkActive="active-link">
        <mat-icon matListItemIcon>smart_toy</mat-icon>
        <span matListItemTitle>Agents</span>
      </a>
      <mat-list-item disabled>
        <mat-icon matListItemIcon>bar_chart</mat-icon>
        <span matListItemTitle>Statistics</span>
      </mat-list-item>
      <mat-list-item disabled>
        <mat-icon matListItemIcon>settings</mat-icon>
        <span matListItemTitle>Settings</span>
      </mat-list-item>
    </mat-nav-list>
  </aside>

  <section class="admin-content">
    <router-outlet />
  </section>
</div>
```

Create `frontend/src/app/features/admin/admin-dashboard/admin-dashboard.scss`:

```scss
@use 'variables' as *;
@use 'mixins' as *;

:host {
  display: block;
}

.admin-layout {
  display: flex;
  gap: $space-6;
  min-height: calc(100vh - #{$toolbar-height} - #{$space-6} * 2);
}

.admin-sidebar {
  @include glass-panel;
  width: 220px;
  flex-shrink: 0;
  border-radius: $radius-lg;
  padding: $space-4 0;

  .sidebar-title {
    font-size: 1rem;
    font-weight: $weight-semibold;
    margin: 0 $space-4 $space-3;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }

  .active-link {
    background: var(--ac-glass-bg);
  }
}

.admin-content {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds (component is created but not routed yet)

- [ ] **Step 3: Commit**

```
git add frontend/src/app/features/admin/admin-dashboard/
git commit -m "feat: add admin dashboard shell with sidebar navigation"
```

---

### Task 4: Route Configuration & Navigation Updates

**Files:**
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/app.html:16-19`

- [ ] **Step 1: Update routes**

Replace the entire content of `frontend/src/app/app.routes.ts`:

```typescript
import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home/home').then(m => m.Home) },
  { path: 'councils', loadComponent: () => import('./features/council/council-list/council-list').then(m => m.CouncilList) },
  { path: 'councils/new', loadComponent: () => import('./features/council/council-form/council-form').then(m => m.CouncilForm) },
  { path: 'councils/:id/edit', loadComponent: () => import('./features/council/council-form/council-form').then(m => m.CouncilForm) },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/admin-dashboard/admin-dashboard').then(m => m.AdminDashboard),
    children: [
      { path: '', redirectTo: 'agents', pathMatch: 'full' },
      { path: 'agents', loadComponent: () => import('./features/admin/agents/agent-config/agent-config').then(m => m.AgentConfig) },
    ],
  },
  { path: 'agents', redirectTo: '/admin/agents', pathMatch: 'full' },
  { path: 'sessions', loadComponent: () => import('./features/session/session-list/session-list').then(m => m.SessionList) },
  { path: 'sessions/:id', loadComponent: () => import('./features/session/session-view/session-view').then(m => m.SessionView) },
];
```

- [ ] **Step 2: Update toolbar navigation**

In `frontend/src/app/app.html`, replace the "Agents" nav link (line 16-19):

Old:
```html
    <a mat-button routerLink="/agents" routerLinkActive="active-link">
      <mat-icon>smart_toy</mat-icon>
      Agents
    </a>
```

New:
```html
    <a mat-button routerLink="/admin/agents" routerLinkActive="active-link">
      <mat-icon>smart_toy</mat-icon>
      Agents
    </a>
    <a mat-button routerLink="/admin" routerLinkActive="active-link"
       [routerLinkActiveOptions]="{ exact: true }">
      <mat-icon>admin_panel_settings</mat-icon>
      Admin
    </a>
```

- [ ] **Step 3: Verify build compiles**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -5`
Expected: Build succeeds (AgentConfig component doesn't exist yet, but lazy loading means no compile error until navigated)

- [ ] **Step 4: Commit**

```
git add frontend/src/app/app.routes.ts frontend/src/app/app.html
git commit -m "feat: add admin routes, redirect /agents to /admin/agents"
```

---

### Task 5: Add testAgent to ApiService

**Files:**
- Modify: `frontend/src/app/core/api.service.ts:80-81` (after `deleteAgent`)

- [ ] **Step 1: Add testAgent method**

Add after `deleteAgent` method in `frontend/src/app/core/api.service.ts`:

```typescript
  testAgent(id: string, message: string): Observable<{ response: string }> {
    return this.post<{ response: string }>(`/agents/${id}/test`, { message });
  }
```

- [ ] **Step 2: Commit**

```
git add frontend/src/app/core/api.service.ts
git commit -m "feat: add testAgent method to ApiService"
```

---

## Chunk 3: Frontend — Agent Config (Master-Detail)

### Task 6: Agent Config Component — Master-Detail Panel

**Files:**
- Create: `frontend/src/app/features/admin/agents/agent-config/agent-config.ts`
- Create: `frontend/src/app/features/admin/agents/agent-config/agent-config.html`
- Create: `frontend/src/app/features/admin/agents/agent-config/agent-config.scss`

- [ ] **Step 1: Create the component TypeScript**

Create `frontend/src/app/features/admin/agents/agent-config/agent-config.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTabsModule } from '@angular/material/tabs';

import { ApiService } from '../../../../core/api.service';
import { Agent } from '../../../../core/models';
import { AgentTestBench } from '../agent-test-bench/agent-test-bench';
import { AgentTemplates } from '../agent-templates/agent-templates';

@Component({
  selector: 'app-agent-config',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTabsModule,
    AgentTestBench,
    AgentTemplates,
  ],
  templateUrl: './agent-config.html',
  styleUrl: './agent-config.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentConfig {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly agents = signal<Agent[]>([]);
  readonly selectedAgent = signal<Agent | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly saving = signal(false);
  readonly isCreateMode = signal(false);

  readonly hasSelection = computed(() => this.selectedAgent() !== null || this.isCreateMode());

  readonly modelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
  ] as const;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    system_prompt: ['', Validators.required],
    model: ['claude-sonnet-4-20250514'],
  });

  constructor() {
    this.loadAgents();
  }

  private loadAgents(): void {
    this.api.getAgents().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (agents) => {
        this.agents.set(agents);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.message ?? 'Failed to load agents');
        this.loading.set(false);
      },
    });
  }

  selectAgent(agent: Agent): void {
    this.selectedAgent.set(agent);
    this.isCreateMode.set(false);
    this.error.set(null);
    this.form.patchValue({
      name: agent.name,
      system_prompt: agent.system_prompt,
      model: agent.model,
    });
  }

  startCreate(): void {
    this.selectedAgent.set(null);
    this.isCreateMode.set(true);
    this.error.set(null);
    this.form.reset({ name: '', system_prompt: '', model: 'claude-sonnet-4-20250514' });
  }

  onSave(): void {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);

    const data = this.form.getRawValue();
    const selected = this.selectedAgent();

    const request$ = selected
      ? this.api.updateAgent(selected.id, data)
      : this.api.createAgent(data);

    request$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (saved) => {
        if (selected) {
          this.agents.update(list => list.map(a => a.id === saved.id ? saved : a));
        } else {
          this.agents.update(list => [...list, saved]);
        }
        this.selectedAgent.set(saved);
        this.isCreateMode.set(false);
        this.saving.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to save agent');
        this.saving.set(false);
      },
    });
  }

  onDelete(): void {
    const agent = this.selectedAgent();
    if (!agent) return;
    if (!confirm(`Delete agent "${agent.name}"? This cannot be undone.`)) return;

    this.api.deleteAgent(agent.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.agents.update(list => list.filter(a => a.id !== agent.id));
        this.selectedAgent.set(null);
        this.isCreateMode.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Failed to delete agent');
      },
    });
  }

  onAgentCloned(agent: Agent): void {
    this.agents.update(list => [...list, agent]);
    this.selectAgent(agent);
  }
}
```

- [ ] **Step 2: Create the template**

Create `frontend/src/app/features/admin/agents/agent-config/agent-config.html`:

```html
@if (loading()) {
  <div class="center">
    <mat-spinner diameter="48"></mat-spinner>
  </div>
} @else {
  <div class="master-detail">
    <!-- Left pane: agent list -->
    <aside class="agent-list-pane">
      <mat-nav-list>
        @for (agent of agents(); track agent.id) {
          <a mat-list-item
             (click)="selectAgent(agent)"
             [class.selected]="selectedAgent()?.id === agent.id">
            <mat-icon matListItemIcon>smart_toy</mat-icon>
            <span matListItemTitle>{{ agent.name }}</span>
          </a>
        }
      </mat-nav-list>
      <div class="new-agent-action">
        <button mat-stroked-button (click)="startCreate()" class="full-width">
          <mat-icon>add</mat-icon>
          New Agent
        </button>
      </div>
    </aside>

    <!-- Right pane: tabbed content -->
    <div class="detail-pane">
      @if (hasSelection()) {
        <mat-tab-group>
          <mat-tab label="Configure">
            <div class="tab-content">
              <h3>{{ isCreateMode() ? 'New Agent' : selectedAgent()?.name }}</h3>

              <form [formGroup]="form" (ngSubmit)="onSave()">
                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>Name</mat-label>
                  <input matInput formControlName="name" placeholder="e.g. Devil's Advocate">
                </mat-form-field>

                <mat-form-field appearance="outline" class="full-width">
                  <mat-label>System Prompt</mat-label>
                  <textarea matInput formControlName="system_prompt" rows="8"
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
                  @if (!isCreateMode()) {
                    <button mat-button type="button" color="warn" (click)="onDelete()">
                      <mat-icon>delete</mat-icon>
                      Delete
                    </button>
                  }
                  <span class="spacer"></span>
                  <button mat-flat-button type="submit" [disabled]="form.invalid || saving()">
                    @if (saving()) {
                      <mat-spinner diameter="20"></mat-spinner>
                    } @else {
                      {{ isCreateMode() ? 'Create Agent' : 'Save Changes' }}
                    }
                  </button>
                </div>
              </form>
            </div>
          </mat-tab>

          <mat-tab label="Test Bench" [disabled]="isCreateMode()">
            <div class="tab-content">
              @if (selectedAgent(); as agent) {
                <app-agent-test-bench [agent]="agent" />
              }
            </div>
          </mat-tab>

          <mat-tab label="Templates">
            <div class="tab-content">
              <app-agent-templates (cloned)="onAgentCloned($event)" />
            </div>
          </mat-tab>
        </mat-tab-group>
      } @else {
        <div class="empty-detail">
          <mat-icon>smart_toy</mat-icon>
          <p>Select an agent from the list or create a new one.</p>
        </div>
      }
    </div>
  </div>
}
```

- [ ] **Step 3: Create the styles**

Create `frontend/src/app/features/admin/agents/agent-config/agent-config.scss`:

```scss
@use 'variables' as *;
@use 'mixins' as *;

:host {
  display: block;
}

.center {
  @include flex-center;
  padding: $space-12;
}

.master-detail {
  display: flex;
  gap: $space-6;
  min-height: 500px;
}

.agent-list-pane {
  @include glass-panel;
  width: 240px;
  flex-shrink: 0;
  border-radius: $radius-lg;
  padding: $space-2 0;
  display: flex;
  flex-direction: column;
  @include custom-scrollbar;
  overflow-y: auto;

  .selected {
    background: var(--ac-glass-bg);
  }
}

.new-agent-action {
  padding: $space-3 $space-4;
  margin-top: auto;
}

.detail-pane {
  flex: 1;
  min-width: 0;
}

.tab-content {
  padding: $space-6 $space-4;

  h3 {
    margin: 0 0 $space-6;
    font-size: 1.25rem;
    font-weight: $weight-semibold;
  }
}

.full-width {
  width: 100%;
}

.error-text {
  color: var(--mat-sys-error);
  margin: $space-4 0;
}

.form-actions {
  display: flex;
  align-items: center;
  margin-top: $space-6;
  gap: $space-2;

  .spacer {
    flex: 1;
  }

  mat-spinner {
    display: inline-block;
  }
}

.empty-detail {
  @include flex-center;
  flex-direction: column;
  padding: $space-12;
  opacity: 0.5;

  mat-icon {
    font-size: 4rem;
    width: 4rem;
    height: 4rem;
    margin-bottom: $space-4;
  }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -10`
Expected: May fail because `AgentTestBench` and `AgentTemplates` don't exist yet. Continue to next tasks.

- [ ] **Step 5: Commit (partial — will verify build after all components exist)**

```
git add frontend/src/app/features/admin/agents/agent-config/
git commit -m "feat: add agent config master-detail component"
```

---

### Task 7: Agent Test Bench Component

**Files:**
- Create: `frontend/src/app/features/admin/agents/agent-test-bench/agent-test-bench.ts`
- Create: `frontend/src/app/features/admin/agents/agent-test-bench/agent-test-bench.html`
- Create: `frontend/src/app/features/admin/agents/agent-test-bench/agent-test-bench.scss`

- [ ] **Step 1: Create the component TypeScript**

Create `frontend/src/app/features/admin/agents/agent-test-bench/agent-test-bench.ts`:

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../../core/api.service';
import { Agent } from '../../../../core/models';

@Component({
  selector: 'app-agent-test-bench',
  imports: [
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './agent-test-bench.html',
  styleUrl: './agent-test-bench.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentTestBench {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly agent = input.required<Agent>();

  testMessage = '';
  readonly sending = signal(false);
  readonly response = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  send(): void {
    const message = this.testMessage.trim();
    if (!message || this.sending()) return;

    this.sending.set(true);
    this.response.set(null);
    this.error.set(null);

    this.api.testAgent(this.agent().id, message)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.response.set(result.response);
          this.sending.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.detail ?? 'Test failed — could not reach the LLM.');
          this.sending.set(false);
        },
      });
  }
}
```

- [ ] **Step 2: Create the template**

Create `frontend/src/app/features/admin/agents/agent-test-bench/agent-test-bench.html`:

```html
<p class="bench-description">
  Send a test message to <strong>{{ agent().name }}</strong> and see how it responds.
</p>

<mat-form-field appearance="outline" class="full-width">
  <mat-label>Test Message</mat-label>
  <textarea matInput [(ngModel)]="testMessage" rows="3"
    placeholder="Type a message to test this agent's behavior..."
    (keydown.meta.enter)="send()"
    (keydown.control.enter)="send()"></textarea>
</mat-form-field>

<button mat-flat-button (click)="send()" [disabled]="!testMessage.trim() || sending()">
  @if (sending()) {
    <mat-spinner diameter="20"></mat-spinner>
  } @else {
    <mat-icon>send</mat-icon>
    Send
  }
</button>

@if (response()) {
  <mat-card appearance="outlined" class="response-card">
    <mat-card-header>
      <mat-icon matCardAvatar>smart_toy</mat-icon>
      <mat-card-title>{{ agent().name }}</mat-card-title>
    </mat-card-header>
    <mat-card-content>
      <p class="response-text">{{ response() }}</p>
    </mat-card-content>
  </mat-card>
}

@if (error()) {
  <p class="error-text">{{ error() }}</p>
}
```

- [ ] **Step 3: Create the styles**

Create `frontend/src/app/features/admin/agents/agent-test-bench/agent-test-bench.scss`:

```scss
@use 'variables' as *;

.bench-description {
  margin: 0 0 $space-6;
  opacity: 0.7;
}

.full-width {
  width: 100%;
}

button {
  margin-bottom: $space-6;

  mat-spinner {
    display: inline-block;
  }
}

.response-card {
  margin-top: $space-4;

  .response-text {
    white-space: pre-wrap;
    line-height: 1.6;
  }
}

.error-text {
  color: var(--mat-sys-error);
  margin-top: $space-4;
}
```

- [ ] **Step 4: Commit**

```
git add frontend/src/app/features/admin/agents/agent-test-bench/
git commit -m "feat: add agent test bench component"
```

---

### Task 8: Agent Templates Data & Component

**Files:**
- Create: `frontend/src/app/features/admin/agents/agent-templates/templates.data.ts`
- Create: `frontend/src/app/features/admin/agents/agent-templates/agent-templates.ts`
- Create: `frontend/src/app/features/admin/agents/agent-templates/agent-templates.html`
- Create: `frontend/src/app/features/admin/agents/agent-templates/agent-templates.scss`

- [ ] **Step 1: Create the template data**

Create `frontend/src/app/features/admin/agents/agent-templates/templates.data.ts`:

```typescript
export interface AgentTemplate {
  name: string;
  description: string;
  system_prompt: string;
  model: string;
}

export const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    name: "Devil's Advocate",
    description: 'Challenges assumptions, questions consensus, and exposes weaknesses in arguments.',
    system_prompt:
      "You are the Devil's Advocate. Your role is to challenge assumptions, " +
      'question consensus, and expose weaknesses in arguments. You push back ' +
      'on ideas that seem too easy or unexamined, forcing the group to defend ' +
      'their positions rigorously. You are not contrarian for its own sake — ' +
      'you genuinely want the strongest possible conclusion to emerge.',
    model: 'claude-sonnet-4-20250514',
  },
  {
    name: 'Fact Checker',
    description: 'Verifies claims against known evidence and flags unsupported assertions.',
    system_prompt:
      'You are the Fact Checker. Your role is to verify claims against known ' +
      'evidence, flag unsupported assertions, and demand sources. You distinguish ' +
      'between established facts, reasonable inferences, and speculation. You are ' +
      'precise and methodical, and you never let a dubious claim pass unchallenged.',
    model: 'claude-sonnet-4-20250514',
  },
  {
    name: 'Synthesizer',
    description: 'Finds common ground between divergent viewpoints and builds unified positions.',
    system_prompt:
      'You are the Synthesizer. Your role is to find common ground between ' +
      'divergent viewpoints, identify shared premises, and build unified positions. ' +
      'You look for the strongest elements in each argument and weave them into a ' +
      "coherent whole. You are diplomatic but intellectually honest — you won't " +
      'paper over genuine disagreements.',
    model: 'claude-sonnet-4-20250514',
  },
  {
    name: 'Source Critic',
    description: 'Evaluates the credibility and bias of sources, evidence, and reasoning.',
    system_prompt:
      'You are the Source Critic. Your role is to evaluate the credibility and ' +
      'bias of sources, evidence, and reasoning. You assess whether claims are ' +
      'well-supported, whether sources are reliable, and whether reasoning is ' +
      'logically sound. You are skeptical but fair — you acknowledge strong ' +
      'evidence when you see it.',
    model: 'claude-sonnet-4-20250514',
  },
  {
    name: 'Logical Analyst',
    description: 'Identifies logical fallacies, reasoning gaps, and structural weaknesses.',
    system_prompt:
      'You are the Logical Analyst. Your role is to identify logical fallacies, ' +
      'reasoning gaps, and structural weaknesses in arguments. You evaluate whether ' +
      'conclusions follow from premises, flag circular reasoning, and test arguments ' +
      'against edge cases. You are precise and systematic in your analysis.',
    model: 'claude-sonnet-4-20250514',
  },
];
```

- [ ] **Step 2: Create the component TypeScript**

Create `frontend/src/app/features/admin/agents/agent-templates/agent-templates.ts`:

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../../core/api.service';
import { Agent } from '../../../../core/models';
import { AGENT_TEMPLATES, AgentTemplate } from './templates.data';

@Component({
  selector: 'app-agent-templates',
  imports: [MatButtonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './agent-templates.html',
  styleUrl: './agent-templates.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgentTemplates {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly templates = AGENT_TEMPLATES;
  readonly cloning = signal<string | null>(null);
  readonly error = signal<string | null>(null);

  readonly cloned = output<Agent>();

  clone(template: AgentTemplate): void {
    if (this.cloning()) return;
    this.cloning.set(template.name);
    this.error.set(null);

    this.api.createAgent({
      name: template.name,
      system_prompt: template.system_prompt,
      model: template.model,
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (agent) => {
        this.cloned.emit(agent);
        this.cloning.set(null);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? `Failed to create agent from template "${template.name}"`);
        this.cloning.set(null);
      },
    });
  }
}
```

- [ ] **Step 3: Create the template HTML**

Create `frontend/src/app/features/admin/agents/agent-templates/agent-templates.html`:

```html
<p class="templates-description">
  Pre-built agent personas ready to clone. Click "Clone" to create a new agent from a template.
</p>

@if (error()) {
  <p class="error-text">{{ error() }}</p>
}

<div class="template-grid">
  @for (template of templates; track template.name) {
    <mat-card appearance="outlined" class="template-card">
      <mat-card-header>
        <mat-icon matCardAvatar>smart_toy</mat-icon>
        <mat-card-title>{{ template.name }}</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p class="template-description">{{ template.description }}</p>
        <p class="template-prompt">{{ template.system_prompt }}</p>
      </mat-card-content>
      <mat-card-actions>
        <button mat-button (click)="clone(template)" [disabled]="cloning() !== null">
          @if (cloning() === template.name) {
            <mat-spinner diameter="18"></mat-spinner>
          } @else {
            <mat-icon>content_copy</mat-icon>
          }
          Clone
        </button>
      </mat-card-actions>
    </mat-card>
  }
</div>
```

- [ ] **Step 4: Create the styles**

Create `frontend/src/app/features/admin/agents/agent-templates/agent-templates.scss`:

```scss
@use 'variables' as *;
@use 'mixins' as *;

.templates-description {
  margin: 0 0 $space-6;
  opacity: 0.7;
}

.error-text {
  color: var(--mat-sys-error);
  margin-bottom: $space-4;
}

.template-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: $space-4;
}

.template-card {
  @include hover-glow;

  .template-description {
    font-size: 0.875rem;
    margin: 0 0 $space-2;
  }

  .template-prompt {
    font-size: 0.8rem;
    opacity: 0.6;
    @include line-clamp(3);
    margin: 0;
  }

  mat-spinner {
    display: inline-block;
  }
}
```

- [ ] **Step 5: Commit**

```
git add frontend/src/app/features/admin/agents/agent-templates/
git commit -m "feat: add agent templates data and component"
```

---

## Chunk 4: Cleanup & Verification

### Task 9: Delete Old Agent Components

**Files:**
- Delete: `frontend/src/app/features/agent/agent-list/` (entire directory)
- Delete: `frontend/src/app/features/agent/agent-form/` (entire directory)

- [ ] **Step 1: Delete old agent components**

```bash
rm -rf frontend/src/app/features/agent/
```

- [ ] **Step 2: Verify no imports reference the deleted components**

Run: `cd frontend && grep -r "features/agent/" src/ --include="*.ts" || echo "No references found"`
Expected: "No references found" (routes already updated, no other imports should exist)

- [ ] **Step 3: Build the frontend**

Run: `cd frontend && npx ng build --configuration development 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 4: Run frontend tests**

Run: `./test-frontend.sh`
Expected: Tests pass (old agent-list.spec.ts is deleted, no new tests reference it)

- [ ] **Step 5: Commit**

```
git add -u frontend/src/app/features/agent/
git commit -m "refactor: remove standalone agent pages (replaced by admin panel)"
```

---

### Task 10: Update SPEC.md

**Files:**
- Modify: `SPEC.md` (Frontend Navigation table)

- [ ] **Step 1: Update the Frontend Navigation table**

In `SPEC.md`, find the Frontend Navigation section and replace the agent routes:

Old:
```
| `/agents` | `AgentList` | List/manage agents |
| `/agents/new` | `AgentCreate` | Form to create an agent |
| `/agents/:id/edit` | `AgentEdit` | Form to edit an agent |
```

New:
```
| `/admin` | `AdminDashboard` | Admin shell with sidebar navigation |
| `/admin/agents` | `AgentConfig` | Agent management (master-detail panel) |
| `/agents` | _(redirect)_ | Redirects to `/admin/agents` |
```

- [ ] **Step 2: Add the test endpoint to the API table in SPEC.md**

Find the Agents API table and add after the DELETE row:

```
| `POST` | `/agents/{id}/test` | `AgentTestRequest` | `AgentTestResponse` | 200 |
```

- [ ] **Step 3: Commit**

```
git add SPEC.md
git commit -m "docs: update SPEC.md with admin routes and test endpoint"
```

---

### Task 11: Update TODO.md

**Files:**
- Modify: `TODO.md` (Section 17)

- [ ] **Step 1: Check off completed items**

In `TODO.md`, mark completed items in Section 17:

```
- [x] **Create `/admin` route and `AdminDashboard` component** — ...
- [x] **Add "Admin" link to toolbar** — ...
- [x] **Agent configuration panel** — ...
- [x] **Agent test bench** — ...
- [x] **Agent templates library** — ...
```

- [ ] **Step 2: Commit**

```
git add TODO.md
git commit -m "docs: mark admin dashboard overview and agent management as complete"
```

---

### Task 12: Full Verification

- [ ] **Step 1: Run full backend test suite**

Run: `./test-backend.sh`
Expected: All tests PASS

- [ ] **Step 2: Run full frontend test suite**

Run: `./test-frontend.sh`
Expected: All tests PASS

- [ ] **Step 3: Build production frontend**

Run: `cd frontend && npx ng build`
Expected: Build succeeds

- [ ] **Step 4: Manual smoke test (if running locally)**

1. Start backend: `cd backend && uvicorn app.main:app --reload --port 8000`
2. Start frontend: `cd frontend && ng serve --proxy-config proxy.conf.json`
3. Navigate to `http://localhost:4200/admin` — should see sidebar with Agents link
4. Click Agents — should see master-detail with agent list on left
5. Click "+ New Agent" — should show blank form in Configure tab
6. Create an agent — should appear in list
7. Select the agent — form should populate
8. Click "Test Bench" tab — should be able to send a test message
9. Click "Templates" tab — should see 5 template cards
10. Clone a template — new agent should appear in list
11. Navigate to `/agents` — should redirect to `/admin/agents`
