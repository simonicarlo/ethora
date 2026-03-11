# Admin Dashboard Complete Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the remaining Admin Dashboard features: tool registry, settings/model config, session statistics, council usage stats, agent performance metrics, and error log viewer.

**Architecture:** Backend adds a new `admin.py` router with stats aggregation endpoints and a settings CRUD (key-value store with Fernet encryption for sensitive values like API keys). Frontend adds four new admin child routes (stats, tools, settings, logs) with standalone Angular components using Signals and Angular Material. Charts use `ng2-charts` (Chart.js wrapper) for session-over-time line charts and status pie charts.

**Tech Stack:** FastAPI + async SQLAlchemy (backend stats), Angular 21 + Signals + Angular Material + ng2-charts (frontend), Alembic (migration), Fernet encryption (settings)

---

## Chunk 1: Backend — Stats Endpoints + Settings

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `backend/app/api/v1/admin.py` | Create | All admin endpoints (stats, settings, error logs) |
| `backend/app/schemas/schemas.py` | Modify | Add stats response schemas, settings schemas |
| `backend/app/models/models.py` | Modify | Add `AppSetting` model |
| `backend/app/core/encryption.py` | Create | Fernet encrypt/decrypt helpers |
| `backend/app/core/config.py` | Modify | Add `SETTINGS_ENCRYPTION_KEY` |
| `backend/app/main.py` | Modify | Mount admin router |
| `backend/alembic/versions/006_add_app_settings_and_indexes.py` | Create | Settings table + stats indexes |
| `backend/requirements.txt` | Modify | Add `cryptography` |
| `backend/tests/test_admin.py` | Create | Tests for all admin endpoints |

---

### Task 1: AppSetting Model + Migration + Encryption

**Files:**
- Create: `backend/app/core/encryption.py`
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/models/models.py`
- Create: `backend/alembic/versions/006_add_app_settings_and_indexes.py`
- Modify: `backend/requirements.txt`
- Test: `backend/tests/test_admin.py`

- [ ] **Step 1: Add `cryptography` to requirements.txt**

Add `cryptography>=44.0.0` after `python-dotenv` in `backend/requirements.txt`.

- [ ] **Step 2: Add `SETTINGS_ENCRYPTION_KEY` to config**

In `backend/app/core/config.py`, add to the `Settings` class:

```python
SETTINGS_ENCRYPTION_KEY: str = ""
```

- [ ] **Step 3: Create encryption helpers**

Create `backend/app/core/encryption.py`:

```python
"""Fernet symmetric encryption for sensitive settings (API keys, etc.)."""
from __future__ import annotations

from cryptography.fernet import Fernet

from app.core.config import settings


def _get_fernet() -> Fernet:
    key = settings.SETTINGS_ENCRYPTION_KEY
    if not key:
        raise RuntimeError(
            "SETTINGS_ENCRYPTION_KEY is not set. "
            "Generate one with: python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )
    return Fernet(key.encode())


def encrypt_value(plaintext: str) -> str:
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_value(ciphertext: str) -> str:
    return _get_fernet().decrypt(ciphertext.encode()).decode()
```

- [ ] **Step 4: Add AppSetting model**

In `backend/app/models/models.py`, add after the `Verdict` class:

```python
class AppSetting(Base):
    __tablename__ = "app_settings"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    key: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_utcnow, onupdate=_utcnow)
```

- [ ] **Step 5: Create Alembic migration**

Create `backend/alembic/versions/006_add_app_settings_and_indexes.py`:

```python
"""Add app_settings table and stats indexes

Revision ID: 006
Revises: 005
Create Date: 2026-03-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("key", sa.String(), unique=True, nullable=False),
        sa.Column("encrypted_value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_status", "sessions", ["status"])
    op.create_index("ix_sessions_created_at", "sessions", ["created_at"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_messages_created_at", table_name="messages")
    op.drop_index("ix_sessions_created_at", table_name="sessions")
    op.drop_index("ix_sessions_status", table_name="sessions")
    op.drop_table("app_settings")
```

- [ ] **Step 6: Install cryptography**

Run: `cd backend && pip install cryptography>=44.0.0`

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/encryption.py backend/app/core/config.py backend/app/models/models.py backend/alembic/versions/006_add_app_settings_and_indexes.py backend/requirements.txt
git commit -m "feat: add AppSetting model, encryption helpers, and stats indexes"
```

---

### Task 2: Stats + Settings Schemas

**Files:**
- Modify: `backend/app/schemas/schemas.py`

- [ ] **Step 1: Add admin schemas to schemas.py**

Add at the end of `backend/app/schemas/schemas.py`:

```python
# -- Admin Stats --------------------------------------------------------------

class DailyCount(BaseModel):
    date: str
    count: int


class SessionStatsResponse(BaseModel):
    total_sessions: int
    sessions_by_status: dict[str, int]
    completion_rate: float
    avg_rounds_per_session: float
    sessions_over_time: list[DailyCount]


class CouncilUsageItem(BaseModel):
    council_id: uuid.UUID
    council_name: str
    session_count: int
    avg_deliberation_seconds: float | None


class CouncilStatsResponse(BaseModel):
    council_usage: list[CouncilUsageItem]


class AgentMetricItem(BaseModel):
    agent_id: uuid.UUID
    agent_name: str
    message_count: int
    avg_message_length: float
    voting_alignment: float | None


class AgentStatsResponse(BaseModel):
    agent_metrics: list[AgentMetricItem]


class ErrorLogEntry(BaseModel):
    session_id: uuid.UUID
    council_name: str
    input_claim: str
    error_message: str | None
    created_at: datetime


# -- Admin Settings -----------------------------------------------------------

SENSITIVE_KEYS: set[str] = {"anthropic_api_key"}


class SettingResponse(BaseModel):
    key: str
    value: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SettingUpdate(BaseModel):
    value: str = Field(min_length=1)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/schemas/schemas.py
git commit -m "feat: add admin stats and settings Pydantic schemas"
```

---

### Task 3: Admin Router — Stats Endpoints

**Files:**
- Create: `backend/app/api/v1/admin.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_admin.py`

- [ ] **Step 1: Write tests for stats endpoints**

Create `backend/tests/test_admin.py`:

```python
"""Tests for admin stats, settings, and error log endpoints."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

import pytest
from httpx import AsyncClient

from app.models.models import Agent, Council, Message, Round, Session, Verdict, Vote, council_agents


@pytest.fixture()
async def seeded_data(db_session):
    """Create agents, councils, sessions, rounds, messages, votes, and verdicts for stats tests."""
    agent1 = Agent(id=uuid.uuid4(), name="Agent A", system_prompt="prompt a", model="claude-sonnet-4-20250514")
    agent2 = Agent(id=uuid.uuid4(), name="Agent B", system_prompt="prompt b", model="claude-sonnet-4-20250514")
    db_session.add_all([agent1, agent2])
    await db_session.flush()

    council = Council(id=uuid.uuid4(), name="Test Council", rounds=3, voting_mechanism="majority")
    db_session.add(council)
    await db_session.flush()

    await db_session.execute(council_agents.insert().values(council_id=council.id, agent_id=agent1.id))
    await db_session.execute(council_agents.insert().values(council_id=council.id, agent_id=agent2.id))

    # Complete session
    s1 = Session(id=uuid.uuid4(), council_id=council.id, input_claim="Claim 1", status="complete")
    # Error session
    s2 = Session(id=uuid.uuid4(), council_id=council.id, input_claim="Claim 2", status="error")
    # Pending session
    s3 = Session(id=uuid.uuid4(), council_id=council.id, input_claim="Claim 3", status="pending")
    db_session.add_all([s1, s2, s3])
    await db_session.flush()

    r1 = Round(id=uuid.uuid4(), session_id=s1.id, round_number=1)
    db_session.add(r1)
    await db_session.flush()

    m1 = Message(id=uuid.uuid4(), round_id=r1.id, agent_id=agent1.id, content="Short message")
    m2 = Message(id=uuid.uuid4(), round_id=r1.id, agent_id=agent2.id, content="A much longer message with more words in it for testing")
    db_session.add_all([m1, m2])

    v1 = Vote(id=uuid.uuid4(), session_id=s1.id, agent_id=agent1.id, value="true", confidence=0.9, reasoning="agree")
    v2 = Vote(id=uuid.uuid4(), session_id=s1.id, agent_id=agent2.id, value="true", confidence=0.8, reasoning="also agree")
    db_session.add_all([v1, v2])

    verdict = Verdict(id=uuid.uuid4(), session_id=s1.id, decision="true", confidence=0.85, summary="All agreed")
    db_session.add(verdict)
    await db_session.flush()

    return {"agents": [agent1, agent2], "council": council, "sessions": [s1, s2, s3]}


@pytest.mark.anyio
async def test_session_stats(client: AsyncClient, seeded_data):
    resp = await client.get("/api/v1/admin/stats/sessions")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_sessions"] == 3
    assert data["sessions_by_status"]["complete"] == 1
    assert data["sessions_by_status"]["error"] == 1
    assert data["completion_rate"] == pytest.approx(1 / 3, abs=0.01)
    assert isinstance(data["sessions_over_time"], list)


@pytest.mark.anyio
async def test_council_stats(client: AsyncClient, seeded_data):
    resp = await client.get("/api/v1/admin/stats/councils")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["council_usage"]) == 1
    assert data["council_usage"][0]["session_count"] == 3


@pytest.mark.anyio
async def test_agent_stats(client: AsyncClient, seeded_data):
    resp = await client.get("/api/v1/admin/stats/agents")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["agent_metrics"]) == 2
    for metric in data["agent_metrics"]:
        assert metric["message_count"] >= 1
        assert metric["avg_message_length"] > 0


@pytest.mark.anyio
async def test_error_logs(client: AsyncClient, seeded_data):
    resp = await client.get("/api/v1/admin/logs/errors")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["input_claim"] == "Claim 2"
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/test_admin.py -v`
Expected: FAIL (no admin module yet)

- [ ] **Step 3: Create admin router with stats endpoints**

Create `backend/app/api/v1/admin.py`:

```python
"""Admin endpoints — statistics, settings, and error logs."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select, case, extract

from app.api.v1.deps import DBSession
from app.models.models import Agent, AppSetting, Council, Message, Round, Session, Verdict, Vote, council_agents
from app.schemas.schemas import (
    AgentMetricItem,
    AgentStatsResponse,
    CouncilStatsResponse,
    CouncilUsageItem,
    DailyCount,
    ErrorLogEntry,
    SessionStatsResponse,
    SettingResponse,
    SettingUpdate,
    SENSITIVE_KEYS,
)

router = APIRouter(prefix="/api/v1", tags=["admin"])


# -- Session stats ------------------------------------------------------------

@router.get("/admin/stats/sessions", response_model=SessionStatsResponse)
async def session_stats(
    db: DBSession,
    days: int = Query(30, ge=1, le=365),
) -> SessionStatsResponse:
    # Total sessions
    total_result = await db.execute(select(func.count(Session.id)))
    total_sessions: int = total_result.scalar_one()

    # Sessions by status
    status_result = await db.execute(
        select(Session.status, func.count(Session.id)).group_by(Session.status)
    )
    sessions_by_status: dict[str, int] = {row[0]: row[1] for row in status_result.all()}

    # Completion rate
    complete_count = sessions_by_status.get("complete", 0)
    completion_rate = complete_count / total_sessions if total_sessions > 0 else 0.0

    # Average rounds per session
    rounds_result = await db.execute(
        select(func.avg(func.count(Round.id)))
        .select_from(Round)
        .group_by(Round.session_id)
    )
    avg_rounds_raw = rounds_result.scalar_one_or_none()
    avg_rounds_per_session = float(avg_rounds_raw) if avg_rounds_raw else 0.0

    # Sessions over time (last N days)
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    # Use date(created_at) for SQLite compatibility in tests
    date_expr = func.date(Session.created_at)
    time_result = await db.execute(
        select(date_expr.label("day"), func.count(Session.id))
        .where(Session.created_at >= cutoff)
        .group_by(date_expr)
        .order_by(date_expr)
    )
    sessions_over_time = [
        DailyCount(date=str(row[0]), count=row[1])
        for row in time_result.all()
    ]

    return SessionStatsResponse(
        total_sessions=total_sessions,
        sessions_by_status=sessions_by_status,
        completion_rate=completion_rate,
        avg_rounds_per_session=avg_rounds_per_session,
        sessions_over_time=sessions_over_time,
    )


# -- Council stats ------------------------------------------------------------

@router.get("/admin/stats/councils", response_model=CouncilStatsResponse)
async def council_stats(db: DBSession) -> CouncilStatsResponse:
    result = await db.execute(
        select(
            Council.id,
            Council.name,
            func.count(Session.id).label("session_count"),
        )
        .outerjoin(Session, Session.council_id == Council.id)
        .group_by(Council.id, Council.name)
        .order_by(func.count(Session.id).desc())
    )
    usage = [
        CouncilUsageItem(
            council_id=row[0],
            council_name=row[1],
            session_count=row[2],
            avg_deliberation_seconds=None,  # computed separately below
        )
        for row in result.all()
    ]

    # Compute avg deliberation time for councils with complete sessions
    for item in usage:
        dur_result = await db.execute(
            select(
                func.avg(
                    extract("epoch", Verdict.created_at) - extract("epoch", Session.created_at)
                )
            )
            .select_from(Session)
            .join(Verdict, Verdict.session_id == Session.id)
            .where(Session.council_id == item.council_id)
            .where(Session.status == "complete")
        )
        avg_dur = dur_result.scalar_one_or_none()
        if avg_dur is not None:
            item.avg_deliberation_seconds = float(avg_dur)

    return CouncilStatsResponse(council_usage=usage)


# -- Agent stats --------------------------------------------------------------

@router.get("/admin/stats/agents", response_model=AgentStatsResponse)
async def agent_stats(db: DBSession) -> AgentStatsResponse:
    result = await db.execute(
        select(
            Agent.id,
            Agent.name,
            func.count(Message.id).label("message_count"),
            func.avg(func.length(Message.content)).label("avg_length"),
        )
        .outerjoin(Message, Message.agent_id == Agent.id)
        .group_by(Agent.id, Agent.name)
        .order_by(func.count(Message.id).desc())
    )
    metrics = []
    for row in result.all():
        agent_id, agent_name, message_count, avg_length = row

        # Voting alignment: % of votes matching the final verdict decision
        alignment_result = await db.execute(
            select(
                func.count(Vote.id).filter(Vote.value == Verdict.decision),
                func.count(Vote.id),
            )
            .select_from(Vote)
            .join(Verdict, Verdict.session_id == Vote.session_id)
            .where(Vote.agent_id == agent_id)
        )
        aligned, total_votes = alignment_result.one()
        voting_alignment = (aligned / total_votes) if total_votes > 0 else None

        metrics.append(
            AgentMetricItem(
                agent_id=agent_id,
                agent_name=agent_name,
                message_count=message_count,
                avg_message_length=float(avg_length) if avg_length else 0.0,
                voting_alignment=voting_alignment,
            )
        )

    return AgentStatsResponse(agent_metrics=metrics)


# -- Error logs ---------------------------------------------------------------

@router.get("/admin/logs/errors", response_model=list[ErrorLogEntry])
async def recent_errors(
    db: DBSession,
    limit: int = Query(20, ge=1, le=100),
) -> list[ErrorLogEntry]:
    result = await db.execute(
        select(Session.id, Council.name, Session.input_claim, Session.created_at)
        .join(Council, Session.council_id == Council.id)
        .where(Session.status == "error")
        .order_by(Session.created_at.desc())
        .limit(limit)
    )
    return [
        ErrorLogEntry(
            session_id=row[0],
            council_name=row[1],
            input_claim=row[2],
            error_message=None,
            created_at=row[3],
        )
        for row in result.all()
    ]


# -- Settings CRUD ------------------------------------------------------------

@router.get("/admin/settings", response_model=list[SettingResponse])
async def list_settings(db: DBSession) -> list[SettingResponse]:
    from app.core.encryption import decrypt_value

    result = await db.execute(select(AppSetting).order_by(AppSetting.key))
    settings_list: list[SettingResponse] = []
    for setting in result.scalars().all():
        try:
            decrypted = decrypt_value(setting.encrypted_value)
        except Exception:
            decrypted = "**decryption failed**"

        # Mask sensitive values
        if setting.key in SENSITIVE_KEYS and len(decrypted) > 8:
            display_value = decrypted[:3] + "..." + decrypted[-4:]
        else:
            display_value = decrypted

        settings_list.append(
            SettingResponse(key=setting.key, value=display_value, updated_at=setting.updated_at)
        )
    return settings_list


@router.put("/admin/settings/{key}", response_model=SettingResponse)
async def upsert_setting(key: str, body: SettingUpdate, db: DBSession) -> SettingResponse:
    from app.core.encryption import encrypt_value

    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()

    encrypted = encrypt_value(body.value)

    if setting is None:
        setting = AppSetting(key=key, encrypted_value=encrypted)
        db.add(setting)
    else:
        setting.encrypted_value = encrypted
        setting.updated_at = datetime.now(timezone.utc)

    await db.flush()
    await db.refresh(setting)

    # Return masked value for sensitive keys
    display_value = body.value
    if key in SENSITIVE_KEYS and len(body.value) > 8:
        display_value = body.value[:3] + "..." + body.value[-4:]

    return SettingResponse(key=setting.key, value=display_value, updated_at=setting.updated_at)


@router.delete("/admin/settings/{key}", status_code=204)
async def delete_setting(key: str, db: DBSession) -> None:
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if setting is None:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    await db.delete(setting)
    await db.flush()
```

- [ ] **Step 4: Mount admin router in main.py**

In `backend/app/main.py`, add import and include:

```python
from app.api.v1.admin import router as admin_router
# ... after existing includes:
app.include_router(admin_router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && python -m pytest tests/test_admin.py -v`
Expected: All 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/admin.py backend/app/main.py backend/tests/test_admin.py
git commit -m "feat: add admin stats, settings, and error log endpoints"
```

---

## Chunk 2: Frontend — Admin Models, API Methods, and Chart Library

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/app/core/models.ts` | Modify | Add admin TypeScript interfaces |
| `frontend/src/app/core/api.service.ts` | Modify | Add admin API methods |
| `frontend/package.json` | Modify | Add `ng2-charts` + `chart.js` |

---

### Task 4: Install Chart Library

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install ng2-charts and chart.js**

Run: `cd frontend && npm install ng2-charts chart.js`

- [ ] **Step 2: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat: add ng2-charts and chart.js for admin statistics"
```

---

### Task 5: Admin TypeScript Interfaces + API Methods

**Files:**
- Modify: `frontend/src/app/core/models.ts`
- Modify: `frontend/src/app/core/api.service.ts`

- [ ] **Step 1: Add admin interfaces to models.ts**

Add at the end of `frontend/src/app/core/models.ts`:

```typescript
// -- Admin Stats --------------------------------------------------------------

export interface DailyCount {
  date: string;
  count: number;
}

export interface SessionStats {
  total_sessions: number;
  sessions_by_status: Record<string, number>;
  completion_rate: number;
  avg_rounds_per_session: number;
  sessions_over_time: DailyCount[];
}

export interface CouncilUsageItem {
  council_id: string;
  council_name: string;
  session_count: number;
  avg_deliberation_seconds: number | null;
}

export interface CouncilStats {
  council_usage: CouncilUsageItem[];
}

export interface AgentMetricItem {
  agent_id: string;
  agent_name: string;
  message_count: number;
  avg_message_length: number;
  voting_alignment: number | null;
}

export interface AgentStats {
  agent_metrics: AgentMetricItem[];
}

export interface ErrorLogEntry {
  session_id: string;
  council_name: string;
  input_claim: string;
  error_message: string | null;
  created_at: string;
}

// -- Admin Settings -----------------------------------------------------------

export interface AppSetting {
  key: string;
  value: string;
  updated_at: string;
}
```

- [ ] **Step 2: Add admin API methods to api.service.ts**

Add imports for the new types, then add methods at the end of the `ApiService` class:

```typescript
// -- Admin Stats --

getSessionStats(days: number = 30): Observable<SessionStats> {
  return this.http.get<SessionStats>(`${this.basePath}/admin/stats/sessions`, {
    params: { days: days.toString() },
  });
}

getCouncilStats(): Observable<CouncilStats> {
  return this.http.get<CouncilStats>(`${this.basePath}/admin/stats/councils`);
}

getAgentStats(): Observable<AgentStats> {
  return this.http.get<AgentStats>(`${this.basePath}/admin/stats/agents`);
}

getErrorLogs(limit: number = 20): Observable<ErrorLogEntry[]> {
  return this.http.get<ErrorLogEntry[]>(`${this.basePath}/admin/logs/errors`, {
    params: { limit: limit.toString() },
  });
}

// -- Admin Settings --

getSettings(): Observable<AppSetting[]> {
  return this.get<AppSetting[]>('/admin/settings');
}

updateSetting(key: string, value: string): Observable<AppSetting> {
  return this.put<AppSetting>(`/admin/settings/${key}`, { value });
}

deleteSetting(key: string): Observable<void> {
  return this.delete<void>(`/admin/settings/${key}`);
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/core/models.ts frontend/src/app/core/api.service.ts
git commit -m "feat: add admin stats/settings interfaces and API methods"
```

---

## Chunk 3: Frontend — Statistics Dashboard Component

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/app/features/admin/stats/stats-dashboard.ts` | Create | Stats container: loads data, renders charts + tables |
| `frontend/src/app/features/admin/stats/stats-dashboard.html` | Create | Template |
| `frontend/src/app/features/admin/stats/stats-dashboard.scss` | Create | Styles |

---

### Task 6: Statistics Dashboard Component

**Files:**
- Create: `frontend/src/app/features/admin/stats/stats-dashboard.ts`
- Create: `frontend/src/app/features/admin/stats/stats-dashboard.html`
- Create: `frontend/src/app/features/admin/stats/stats-dashboard.scss`

- [ ] **Step 1: Create stats-dashboard.ts**

Create `frontend/src/app/features/admin/stats/stats-dashboard.ts`:

```typescript
import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DecimalPipe, DatePipe, KeyValuePipe, PercentPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartData } from 'chart.js';
import { forkJoin } from 'rxjs';

import { ApiService } from '../../../core/api.service';
import {
  SessionStats,
  CouncilStats,
  AgentStats,
  AgentMetricItem,
  CouncilUsageItem,
} from '../../../core/models';

@Component({
  selector: 'app-stats-dashboard',
  imports: [
    DecimalPipe,
    DatePipe,
    KeyValuePipe,
    PercentPipe,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatButtonModule,
    MatChipsModule,
    BaseChartDirective,
  ],
  templateUrl: './stats-dashboard.html',
  styleUrl: './stats-dashboard.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StatsDashboard {
  private readonly api = inject(ApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly sessionStats = signal<SessionStats | null>(null);
  readonly councilStats = signal<CouncilStats | null>(null);
  readonly agentStats = signal<AgentStats | null>(null);

  readonly councilColumns = ['council_name', 'session_count', 'avg_time'];
  readonly agentColumns = ['agent_name', 'message_count', 'avg_length', 'alignment'];

  readonly statusChartData = computed<ChartData<'doughnut'>>(() => {
    const stats = this.sessionStats();
    if (!stats) return { labels: [], datasets: [] };
    const entries = Object.entries(stats.sessions_by_status);
    return {
      labels: entries.map(([k]) => k),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: ['#4caf50', '#f44336', '#ff9800', '#2196f3', '#9c27b0', '#607d8b'],
      }],
    };
  });

  readonly statusChartOptions: ChartConfiguration<'doughnut'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom' } },
  };

  readonly timelineChartData = computed<ChartData<'line'>>(() => {
    const stats = this.sessionStats();
    if (!stats) return { labels: [], datasets: [] };
    return {
      labels: stats.sessions_over_time.map(d => d.date),
      datasets: [{
        label: 'Sessions',
        data: stats.sessions_over_time.map(d => d.count),
        borderColor: '#7c4dff',
        backgroundColor: 'rgba(124, 77, 255, 0.1)',
        fill: true,
        tension: 0.3,
      }],
    };
  });

  readonly timelineChartOptions: ChartConfiguration<'line'>['options'] = {
    responsive: true,
    maintainAspectRatio: false,
    scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    plugins: { legend: { display: false } },
  };

  constructor() {
    this.loadStats();
  }

  loadStats(): void {
    this.loading.set(true);
    this.error.set(null);

    forkJoin({
      sessions: this.api.getSessionStats(),
      councils: this.api.getCouncilStats(),
      agents: this.api.getAgentStats(),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.sessionStats.set(data.sessions);
          this.councilStats.set(data.councils);
          this.agentStats.set(data.agents);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.message ?? 'Failed to load statistics');
          this.loading.set(false);
        },
      });
  }

  formatDuration(seconds: number | null): string {
    if (seconds === null) return '—';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    return `${Math.round(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  }
}
```

- [ ] **Step 2: Create stats-dashboard.html**

Create `frontend/src/app/features/admin/stats/stats-dashboard.html`:

```html
@if (loading()) {
  <div class="loading-container">
    <mat-spinner diameter="40" />
  </div>
} @else if (error()) {
  <div class="error-banner">
    <mat-icon>error_outline</mat-icon>
    <span>{{ error() }}</span>
    <button mat-button (click)="loadStats()">Retry</button>
  </div>
} @else {
  <div class="stats-layout">
    <!-- Overview Tiles -->
    <div class="stat-tiles">
      <mat-card class="stat-tile">
        <mat-icon>forum</mat-icon>
        <div class="stat-value">{{ sessionStats()?.total_sessions ?? 0 }}</div>
        <div class="stat-label">Total Sessions</div>
      </mat-card>
      <mat-card class="stat-tile">
        <mat-icon>check_circle</mat-icon>
        <div class="stat-value">{{ sessionStats()?.completion_rate ?? 0 | percent:'1.0-0' }}</div>
        <div class="stat-label">Completion Rate</div>
      </mat-card>
      <mat-card class="stat-tile">
        <mat-icon>replay</mat-icon>
        <div class="stat-value">{{ sessionStats()?.avg_rounds_per_session ?? 0 | number:'1.1-1' }}</div>
        <div class="stat-label">Avg Rounds</div>
      </mat-card>
    </div>

    <!-- Charts Row -->
    <div class="charts-row">
      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Sessions by Status</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="chart-container">
            <canvas baseChart
              type="doughnut"
              [data]="statusChartData()"
              [options]="statusChartOptions">
            </canvas>
          </div>
        </mat-card-content>
      </mat-card>

      <mat-card class="chart-card">
        <mat-card-header>
          <mat-card-title>Sessions Over Time</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <div class="chart-container">
            <canvas baseChart
              type="line"
              [data]="timelineChartData()"
              [options]="timelineChartOptions">
            </canvas>
          </div>
        </mat-card-content>
      </mat-card>
    </div>

    <!-- Council Usage Table -->
    <mat-card class="table-card">
      <mat-card-header>
        <mat-card-title>Council Usage</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (councilStats()?.council_usage?.length) {
          <table mat-table [dataSource]="councilStats()!.council_usage">
            <ng-container matColumnDef="council_name">
              <th mat-header-cell *matHeaderCellDef>Council</th>
              <td mat-cell *matCellDef="let row">{{ row.council_name }}</td>
            </ng-container>
            <ng-container matColumnDef="session_count">
              <th mat-header-cell *matHeaderCellDef>Sessions</th>
              <td mat-cell *matCellDef="let row">{{ row.session_count }}</td>
            </ng-container>
            <ng-container matColumnDef="avg_time">
              <th mat-header-cell *matHeaderCellDef>Avg Duration</th>
              <td mat-cell *matCellDef="let row">{{ formatDuration(row.avg_deliberation_seconds) }}</td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="councilColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: councilColumns;"></tr>
          </table>
        } @else {
          <p class="empty-state">No council data yet.</p>
        }
      </mat-card-content>
    </mat-card>

    <!-- Agent Performance Table -->
    <mat-card class="table-card">
      <mat-card-header>
        <mat-card-title>Agent Performance</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (agentStats()?.agent_metrics?.length) {
          <table mat-table [dataSource]="agentStats()!.agent_metrics">
            <ng-container matColumnDef="agent_name">
              <th mat-header-cell *matHeaderCellDef>Agent</th>
              <td mat-cell *matCellDef="let row">{{ row.agent_name }}</td>
            </ng-container>
            <ng-container matColumnDef="message_count">
              <th mat-header-cell *matHeaderCellDef>Messages</th>
              <td mat-cell *matCellDef="let row">{{ row.message_count }}</td>
            </ng-container>
            <ng-container matColumnDef="avg_length">
              <th mat-header-cell *matHeaderCellDef>Avg Length</th>
              <td mat-cell *matCellDef="let row">{{ row.avg_message_length | number:'1.0-0' }} chars</td>
            </ng-container>
            <ng-container matColumnDef="alignment">
              <th mat-header-cell *matHeaderCellDef>Vote Alignment</th>
              <td mat-cell *matCellDef="let row">
                @if (row.voting_alignment !== null) {
                  {{ row.voting_alignment | percent:'1.0-0' }}
                } @else {
                  —
                }
              </td>
            </ng-container>
            <tr mat-header-row *matHeaderRowDef="agentColumns"></tr>
            <tr mat-row *matRowDef="let row; columns: agentColumns;"></tr>
          </table>
        } @else {
          <p class="empty-state">No agent data yet.</p>
        }
      </mat-card-content>
    </mat-card>
  </div>
}
```

- [ ] **Step 3: Create stats-dashboard.scss**

Create `frontend/src/app/features/admin/stats/stats-dashboard.scss`:

```scss
@use 'variables' as *;
@use 'mixins' as *;

:host {
  display: block;
}

.loading-container {
  @include flex-center;
  min-height: 300px;
}

.error-banner {
  @include glass-card;
  display: flex;
  align-items: center;
  gap: $space-3;
  color: var(--ac-status-error);
}

.stats-layout {
  @include flex-col($space-6);
}

.stat-tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: $space-4;
}

.stat-tile {
  @include glass-panel;
  border-radius: $radius-lg;
  padding: $space-5;
  text-align: center;

  mat-icon {
    font-size: 2rem;
    width: 2rem;
    height: 2rem;
    opacity: 0.6;
    margin-bottom: $space-2;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: $weight-bold;
    line-height: 1.2;
  }

  .stat-label {
    font-size: 0.8rem;
    opacity: 0.6;
    margin-top: $space-1;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
}

.charts-row {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: $space-4;

  @include respond-down(md) {
    grid-template-columns: 1fr;
  }
}

.chart-card {
  @include glass-panel;
  border-radius: $radius-lg;

  .chart-container {
    position: relative;
    height: 260px;
    padding: $space-4;
  }
}

.table-card {
  @include glass-panel;
  border-radius: $radius-lg;

  table {
    width: 100%;
  }

  .empty-state {
    text-align: center;
    opacity: 0.5;
    padding: $space-6;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/admin/stats/
git commit -m "feat: add statistics dashboard component with charts and tables"
```

---

## Chunk 4: Frontend — Error Log Viewer Component

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/app/features/admin/logs/error-log-viewer.ts` | Create | Error log table with nav to session |
| `frontend/src/app/features/admin/logs/error-log-viewer.html` | Create | Template |
| `frontend/src/app/features/admin/logs/error-log-viewer.scss` | Create | Styles |

---

### Task 7: Error Log Viewer Component

**Files:**
- Create: `frontend/src/app/features/admin/logs/error-log-viewer.ts`
- Create: `frontend/src/app/features/admin/logs/error-log-viewer.html`
- Create: `frontend/src/app/features/admin/logs/error-log-viewer.scss`

- [ ] **Step 1: Create error-log-viewer.ts**

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ApiService } from '../../../core/api.service';
import { ErrorLogEntry } from '../../../core/models';

@Component({
  selector: 'app-error-log-viewer',
  imports: [DatePipe, MatCardModule, MatIconModule, MatTableModule, MatButtonModule, MatProgressSpinnerModule],
  templateUrl: './error-log-viewer.html',
  styleUrl: './error-log-viewer.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ErrorLogViewer {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly errors = signal<ErrorLogEntry[]>([]);
  readonly columns = ['created_at', 'council_name', 'input_claim', 'actions'];

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.getErrorLogs(50).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (data) => { this.errors.set(data); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openSession(sessionId: string): void {
    this.router.navigate(['/sessions', sessionId]);
  }
}
```

- [ ] **Step 2: Create error-log-viewer.html**

```html
<mat-card class="log-card">
  <mat-card-header>
    <mat-card-title>Error Logs</mat-card-title>
    <button mat-icon-button (click)="load()"><mat-icon>refresh</mat-icon></button>
  </mat-card-header>
  <mat-card-content>
    @if (loading()) {
      <div class="loading-container"><mat-spinner diameter="32" /></div>
    } @else if (!errors().length) {
      <p class="empty-state">No errors recorded.</p>
    } @else {
      <table mat-table [dataSource]="errors()">
        <ng-container matColumnDef="created_at">
          <th mat-header-cell *matHeaderCellDef>Time</th>
          <td mat-cell *matCellDef="let row">{{ row.created_at | date:'short' }}</td>
        </ng-container>
        <ng-container matColumnDef="council_name">
          <th mat-header-cell *matHeaderCellDef>Council</th>
          <td mat-cell *matCellDef="let row">{{ row.council_name }}</td>
        </ng-container>
        <ng-container matColumnDef="input_claim">
          <th mat-header-cell *matHeaderCellDef>Claim</th>
          <td mat-cell *matCellDef="let row" class="claim-cell">{{ row.input_claim }}</td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let row">
            <button mat-icon-button (click)="openSession(row.session_id)">
              <mat-icon>open_in_new</mat-icon>
            </button>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="columns"></tr>
        <tr mat-row *matRowDef="let row; columns: columns;"></tr>
      </table>
    }
  </mat-card-content>
</mat-card>
```

- [ ] **Step 3: Create error-log-viewer.scss**

```scss
@use 'variables' as *;
@use 'mixins' as *;

:host { display: block; }

.log-card {
  @include glass-panel;
  border-radius: $radius-lg;

  mat-card-header { display: flex; align-items: center; justify-content: space-between; }

  table { width: 100%; }

  .claim-cell {
    @include truncate;
    max-width: 300px;
  }

  .loading-container { @include flex-center; min-height: 200px; }
  .empty-state { text-align: center; opacity: 0.5; padding: $space-6; }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/admin/logs/
git commit -m "feat: add error log viewer component"
```

---

## Chunk 5: Frontend — Tool Registry + Settings Panels

### File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/app/features/admin/tools/tool-registry.ts` | Create | Tool toggle list with per-tool parameters |
| `frontend/src/app/features/admin/tools/tool-registry.html` | Create | Template |
| `frontend/src/app/features/admin/tools/tool-registry.scss` | Create | Styles |
| `frontend/src/app/features/admin/tools/tool-registry.data.ts` | Create | Tool definitions (static data) |
| `frontend/src/app/features/admin/settings/admin-settings.ts` | Create | API key + model config panel |
| `frontend/src/app/features/admin/settings/admin-settings.html` | Create | Template |
| `frontend/src/app/features/admin/settings/admin-settings.scss` | Create | Styles |

---

### Task 8: Tool Registry Data + Component

**Files:**
- Create: `frontend/src/app/features/admin/tools/tool-registry.data.ts`
- Create: `frontend/src/app/features/admin/tools/tool-registry.ts`
- Create: `frontend/src/app/features/admin/tools/tool-registry.html`
- Create: `frontend/src/app/features/admin/tools/tool-registry.scss`

- [ ] **Step 1: Create tool-registry.data.ts**

```typescript
export interface ToolParameter {
  key: string;
  label: string;
  type: 'number' | 'boolean';
  default: number | boolean;
  min?: number;
  max?: number;
}

export interface ToolDefinition {
  name: string;
  displayName: string;
  description: string;
  icon: string;
  parameters: ToolParameter[];
}

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Allow agents to search the web for information during deliberation.',
    icon: 'travel_explore',
    parameters: [
      { key: 'max_uses', label: 'Max uses per turn', type: 'number', default: 3, min: 1, max: 10 },
    ],
  },
  {
    name: 'code_execution',
    displayName: 'Code Execution',
    description: 'Allow agents to execute code for analysis and computation.',
    icon: 'code',
    parameters: [],
  },
];
```

- [ ] **Step 2: Create tool-registry.ts**

```typescript
import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';

import { AVAILABLE_TOOLS, ToolDefinition } from './tool-registry.data';

interface ToolState {
  enabled: boolean;
  params: Record<string, number | boolean>;
}

@Component({
  selector: 'app-tool-registry',
  imports: [FormsModule, MatCardModule, MatIconModule, MatSlideToggleModule, MatFormFieldModule, MatInputModule, MatListModule],
  templateUrl: './tool-registry.html',
  styleUrl: './tool-registry.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ToolRegistry {
  readonly tools = AVAILABLE_TOOLS;
  readonly selectedTool = signal<ToolDefinition | null>(null);
  readonly toolStates = signal<Record<string, ToolState>>(this.initStates());

  private initStates(): Record<string, ToolState> {
    const states: Record<string, ToolState> = {};
    for (const tool of AVAILABLE_TOOLS) {
      const params: Record<string, number | boolean> = {};
      for (const p of tool.parameters) {
        params[p.key] = p.default;
      }
      states[tool.name] = { enabled: true, params };
    }
    return states;
  }

  selectTool(tool: ToolDefinition): void {
    this.selectedTool.set(tool);
  }

  toggleTool(toolName: string): void {
    this.toolStates.update(s => ({
      ...s,
      [toolName]: { ...s[toolName], enabled: !s[toolName].enabled },
    }));
  }

  updateParam(toolName: string, paramKey: string, value: number | boolean): void {
    this.toolStates.update(s => ({
      ...s,
      [toolName]: {
        ...s[toolName],
        params: { ...s[toolName].params, [paramKey]: value },
      },
    }));
  }
}
```

- [ ] **Step 3: Create tool-registry.html**

```html
<div class="tool-layout">
  <div class="tool-list">
    <h3 class="section-title">Available Tools</h3>
    <mat-nav-list>
      @for (tool of tools; track tool.name) {
        <a mat-list-item (click)="selectTool(tool)"
           [class.active-link]="selectedTool()?.name === tool.name">
          <mat-icon matListItemIcon>{{ tool.icon }}</mat-icon>
          <span matListItemTitle>{{ tool.displayName }}</span>
          <mat-slide-toggle matListItemMeta
            [checked]="toolStates()[tool.name]?.enabled ?? true"
            (change)="toggleTool(tool.name)"
            (click)="$event.stopPropagation()">
          </mat-slide-toggle>
        </a>
      }
    </mat-nav-list>
  </div>

  <div class="tool-detail">
    @if (selectedTool(); as tool) {
      <mat-card class="detail-card">
        <mat-card-header>
          <mat-icon mat-card-avatar>{{ tool.icon }}</mat-icon>
          <mat-card-title>{{ tool.displayName }}</mat-card-title>
        </mat-card-header>
        <mat-card-content>
          <p class="tool-description">{{ tool.description }}</p>

          @if (tool.parameters.length) {
            <h4>Parameters</h4>
            @for (param of tool.parameters; track param.key) {
              @if (param.type === 'number') {
                <mat-form-field appearance="outline">
                  <mat-label>{{ param.label }}</mat-label>
                  <input matInput type="number"
                    [min]="param.min ?? 0" [max]="param.max ?? 100"
                    [ngModel]="toolStates()[tool.name]?.params?.[param.key]"
                    (ngModelChange)="updateParam(tool.name, param.key, $event)">
                </mat-form-field>
              }
            }
          } @else {
            <p class="no-params">No configurable parameters.</p>
          }
        </mat-card-content>
      </mat-card>
    } @else {
      <div class="empty-detail">
        <mat-icon>build</mat-icon>
        <p>Select a tool to view details</p>
      </div>
    }
  </div>
</div>
```

- [ ] **Step 4: Create tool-registry.scss**

```scss
@use 'variables' as *;
@use 'mixins' as *;

:host { display: block; }

.tool-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: $space-4;

  @include respond-down(md) {
    grid-template-columns: 1fr;
  }
}

.tool-list {
  @include glass-panel;
  border-radius: $radius-lg;
  padding: $space-4 0;

  .section-title {
    font-weight: $weight-semibold;
    margin: 0 $space-4 $space-3;
    opacity: 0.7;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 0.75rem;
  }

  mat-nav-list { padding: 0 $space-3; }

  .active-link {
    background: var(--ac-glass-bg);
  }
}

.detail-card {
  @include glass-panel;
  border-radius: $radius-lg;

  .tool-description {
    opacity: 0.7;
    margin-bottom: $space-4;
  }

  h4 {
    font-weight: $weight-semibold;
    margin-bottom: $space-3;
  }

  .no-params {
    opacity: 0.5;
    font-style: italic;
  }
}

.empty-detail {
  @include flex-center;
  @include flex-col($space-3);
  @include glass-panel;
  border-radius: $radius-lg;
  min-height: 300px;
  opacity: 0.4;

  mat-icon { font-size: 3rem; width: 3rem; height: 3rem; }
}
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/features/admin/tools/
git commit -m "feat: add tool registry panel component"
```

---

### Task 9: Admin Settings Component

**Files:**
- Create: `frontend/src/app/features/admin/settings/admin-settings.ts`
- Create: `frontend/src/app/features/admin/settings/admin-settings.html`
- Create: `frontend/src/app/features/admin/settings/admin-settings.scss`

- [ ] **Step 1: Create admin-settings.ts**

```typescript
import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';

import { ApiService } from '../../../core/api.service';
import { AppSetting } from '../../../core/models';

@Component({
  selector: 'app-admin-settings',
  imports: [
    ReactiveFormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatSliderModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  templateUrl: './admin-settings.html',
  styleUrl: './admin-settings.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSettings {
  private readonly api = inject(ApiService);
  private readonly fb = inject(FormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly settings = signal<AppSetting[]>([]);

  readonly modelOptions = [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' },
    { value: 'claude-haiku-4-20250414', label: 'Claude Haiku 4' },
  ] as const;

  readonly apiKeyForm = this.fb.nonNullable.group({
    value: ['', [Validators.required, Validators.minLength(10)]],
  });

  readonly modelForm = this.fb.nonNullable.group({
    default_model: ['claude-sonnet-4-20250514'],
    default_temperature: [1.0],
    default_max_tokens: [4096],
  });

  readonly currentApiKey = signal<string | null>(null);

  constructor() {
    this.loadSettings();
  }

  private loadSettings(): void {
    this.api.getSettings().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (list) => {
        this.settings.set(list);
        for (const s of list) {
          if (s.key === 'anthropic_api_key') this.currentApiKey.set(s.value);
          if (s.key === 'default_model') this.modelForm.patchValue({ default_model: s.value });
          if (s.key === 'default_temperature') this.modelForm.patchValue({ default_temperature: parseFloat(s.value) });
          if (s.key === 'default_max_tokens') this.modelForm.patchValue({ default_max_tokens: parseInt(s.value, 10) });
        }
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  saveApiKey(): void {
    if (this.apiKeyForm.invalid || this.saving()) return;
    this.saving.set(true);
    const value = this.apiKeyForm.getRawValue().value;
    this.api.updateSetting('anthropic_api_key', value).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (s) => {
        this.currentApiKey.set(s.value);
        this.apiKeyForm.reset();
        this.saving.set(false);
        this.snackBar.open('API key updated', 'OK', { duration: 3000 });
      },
      error: () => {
        this.saving.set(false);
        this.snackBar.open('Failed to update API key', 'OK', { duration: 3000 });
      },
    });
  }

  saveModelConfig(): void {
    if (this.saving()) return;
    this.saving.set(true);
    const vals = this.modelForm.getRawValue();

    const updates = [
      this.api.updateSetting('default_model', vals.default_model),
      this.api.updateSetting('default_temperature', vals.default_temperature.toString()),
      this.api.updateSetting('default_max_tokens', vals.default_max_tokens.toString()),
    ];

    import('rxjs').then(({ forkJoin }) => {
      forkJoin(updates).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: () => {
          this.saving.set(false);
          this.snackBar.open('Model configuration saved', 'OK', { duration: 3000 });
        },
        error: () => {
          this.saving.set(false);
          this.snackBar.open('Failed to save configuration', 'OK', { duration: 3000 });
        },
      });
    });
  }
}
```

- [ ] **Step 2: Create admin-settings.html**

```html
@if (loading()) {
  <div class="loading-container"><mat-spinner diameter="40" /></div>
} @else {
  <div class="settings-layout">
    <!-- API Key Section -->
    <mat-card class="settings-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>key</mat-icon>
        <mat-card-title>API Key Management</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (currentApiKey()) {
          <div class="current-key">
            <span class="key-label">Current key:</span>
            <code>{{ currentApiKey() }}</code>
          </div>
        } @else {
          <p class="no-key">No API key configured via settings. Using environment variable.</p>
        }

        <form [formGroup]="apiKeyForm" (ngSubmit)="saveApiKey()" class="key-form">
          <mat-form-field appearance="outline">
            <mat-label>New API Key</mat-label>
            <input matInput formControlName="value" type="password" placeholder="sk-ant-...">
          </mat-form-field>
          <button mat-flat-button type="submit" [disabled]="apiKeyForm.invalid || saving()">
            @if (saving()) { <mat-spinner diameter="18" /> } @else { Update Key }
          </button>
        </form>
      </mat-card-content>
    </mat-card>

    <!-- Model Configuration Section -->
    <mat-card class="settings-card">
      <mat-card-header>
        <mat-icon mat-card-avatar>tune</mat-icon>
        <mat-card-title>Default Model Configuration</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <form [formGroup]="modelForm" (ngSubmit)="saveModelConfig()" class="model-form">
          <mat-form-field appearance="outline">
            <mat-label>Default Model</mat-label>
            <mat-select formControlName="default_model">
              @for (opt of modelOptions; track opt.value) {
                <mat-option [value]="opt.value">{{ opt.label }}</mat-option>
              }
            </mat-select>
          </mat-form-field>

          <div class="slider-field">
            <label>Temperature: {{ modelForm.value.default_temperature }}</label>
            <mat-slider min="0" max="2" step="0.1">
              <input matSliderThumb formControlName="default_temperature">
            </mat-slider>
          </div>

          <mat-form-field appearance="outline">
            <mat-label>Max Tokens</mat-label>
            <input matInput type="number" formControlName="default_max_tokens" min="256" max="8192">
          </mat-form-field>

          <button mat-flat-button type="submit" [disabled]="saving()">
            @if (saving()) { <mat-spinner diameter="18" /> } @else { Save Configuration }
          </button>
        </form>
      </mat-card-content>
    </mat-card>
  </div>
}
```

- [ ] **Step 3: Create admin-settings.scss**

```scss
@use 'variables' as *;
@use 'mixins' as *;

:host { display: block; }

.loading-container { @include flex-center; min-height: 300px; }

.settings-layout {
  @include flex-col($space-6);
}

.settings-card {
  @include glass-panel;
  border-radius: $radius-lg;

  .current-key {
    display: flex;
    align-items: center;
    gap: $space-2;
    margin-bottom: $space-4;

    .key-label { opacity: 0.6; }
    code {
      @include font-mono;
      padding: $space-1 $space-2;
      background: var(--ac-glass-bg);
      border-radius: $radius-xs;
    }
  }

  .no-key {
    opacity: 0.5;
    margin-bottom: $space-4;
  }

  .key-form, .model-form {
    @include flex-col($space-4);
    max-width: 500px;
  }

  .slider-field {
    @include flex-col($space-1);

    label {
      font-size: 0.875rem;
      opacity: 0.7;
    }
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/features/admin/settings/
git commit -m "feat: add admin settings component (API key + model config)"
```

---

## Chunk 6: Wiring — Routes + Sidebar + Chart.js Registration

### Task 10: Register Chart.js + Wire Routes + Sidebar

**Files:**
- Modify: `frontend/src/app/app.config.ts`
- Modify: `frontend/src/app/app.routes.ts`
- Modify: `frontend/src/app/features/admin/admin-dashboard/admin-dashboard.html`

- [ ] **Step 1: Register Chart.js in app.config.ts**

Add to `frontend/src/app/app.config.ts`:

```typescript
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
```

Place this at the top level of the file, outside the `appConfig` export (side-effect registration).

- [ ] **Step 2: Add admin child routes**

In `frontend/src/app/app.routes.ts`, add children to the `admin` route:

```typescript
children: [
  { path: '', redirectTo: 'agents', pathMatch: 'full' },
  { path: 'agents', loadComponent: () => import('./features/admin/agents/agent-config/agent-config').then(m => m.AgentConfig) },
  { path: 'stats', loadComponent: () => import('./features/admin/stats/stats-dashboard').then(m => m.StatsDashboard) },
  { path: 'tools', loadComponent: () => import('./features/admin/tools/tool-registry').then(m => m.ToolRegistry) },
  { path: 'settings', loadComponent: () => import('./features/admin/settings/admin-settings').then(m => m.AdminSettings) },
  { path: 'logs', loadComponent: () => import('./features/admin/logs/error-log-viewer').then(m => m.ErrorLogViewer) },
],
```

- [ ] **Step 3: Update admin sidebar — enable all links**

Replace the disabled `<mat-list-item>` elements in `admin-dashboard.html` with proper `<a>` router links:

```html
<div class="admin-layout">
  <aside class="admin-sidebar">
    <h2 class="sidebar-title">Admin</h2>
    <mat-nav-list>
      <a mat-list-item routerLink="/admin/agents" routerLinkActive="active-link">
        <mat-icon matListItemIcon>smart_toy</mat-icon>
        <span matListItemTitle>Agents</span>
      </a>
      <a mat-list-item routerLink="/admin/stats" routerLinkActive="active-link">
        <mat-icon matListItemIcon>bar_chart</mat-icon>
        <span matListItemTitle>Statistics</span>
      </a>
      <a mat-list-item routerLink="/admin/tools" routerLinkActive="active-link">
        <mat-icon matListItemIcon>build</mat-icon>
        <span matListItemTitle>Tools</span>
      </a>
      <a mat-list-item routerLink="/admin/settings" routerLinkActive="active-link">
        <mat-icon matListItemIcon>settings</mat-icon>
        <span matListItemTitle>Settings</span>
      </a>
      <a mat-list-item routerLink="/admin/logs" routerLinkActive="active-link">
        <mat-icon matListItemIcon>error_outline</mat-icon>
        <span matListItemTitle>Error Logs</span>
      </a>
    </mat-nav-list>
  </aside>

  <section class="admin-content">
    <router-outlet />
  </section>
</div>
```

- [ ] **Step 4: Run frontend build to verify compilation**

Run: `cd frontend && npx ng build --configuration=development 2>&1 | head -20`
Expected: Build succeeds with no errors

- [ ] **Step 5: Run frontend tests**

Run: `./test-frontend.sh`
Expected: All existing tests pass

- [ ] **Step 6: Run backend tests**

Run: `./test-backend.sh`
Expected: All tests pass including new admin tests

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/app.config.ts frontend/src/app/app.routes.ts frontend/src/app/features/admin/admin-dashboard/admin-dashboard.html
git commit -m "feat: wire admin routes, sidebar navigation, and Chart.js registration"
```

---

## Chunk 7: Update TODO.md

### Task 11: Mark TODO Items Complete

**Files:**
- Modify: `TODO.md`

- [ ] **Step 1: Check off all completed Section 17 items in TODO.md**

Mark all items in the Tooling Configuration and Statistics & Monitoring subsections as `[x]`.

- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: mark admin dashboard TODO items complete"
```
