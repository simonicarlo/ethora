# Infrastructure Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `create_all()` with Alembic migrations, pin Python deps, and add pagination to list endpoints.

**Architecture:** Three independent tasks. Alembic gets initialized with async support and runs migrations on app startup. Dependencies get pinned to current versions. List endpoints get `skip`/`limit` query params with SQLAlchemy `.offset().limit()`.

**Tech Stack:** Alembic, SQLAlchemy async, FastAPI Query params, pytest

---

## File Structure

| Action | File | Purpose |
|--------|------|---------|
| Create | `backend/alembic.ini` | Alembic config (points to migrations dir) |
| Create | `backend/alembic/env.py` | Async migration runner, imports Base + settings |
| Create | `backend/alembic/script.py.mako` | Migration template |
| Create | `backend/alembic/versions/001_initial.py` | Initial migration from existing models |
| Modify | `backend/app/main.py` | Replace `create_all()` with Alembic `upgrade head` in lifespan |
| Modify | `backend/requirements.txt` | Pin all dependency versions |
| Modify | `backend/app/api/v1/councils.py` | Add `skip`/`limit` params to list endpoints |
| Modify | `backend/tests/test_api_councils.py` | Add pagination tests |

---

## Task 1: Pin Python Dependency Versions

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: Update requirements.txt with pinned versions**

Replace the contents of `backend/requirements.txt` with:

```
fastapi==0.135.1
uvicorn[standard]==0.41.0
pydantic-settings==2.13.1
anthropic==0.84.0
sqlalchemy[asyncio]==2.0.48
asyncpg==0.31.0
alembic==1.18.4
python-dotenv==1.2.2

# Testing
pytest==9.0.2
pytest-asyncio==1.3.0
httpx==0.28.1
aiosqlite==0.22.1
```

- [ ] **Step 2: Verify install still works**

Run: `cd backend && source .venv/bin/activate && pip install -r requirements.txt`
Expected: all requirements already satisfied (versions match what's installed)

- [ ] **Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "infra: pin Python dependency versions"
```

---

## Task 2: Set Up Alembic Migrations

**Files:**
- Create: `backend/alembic.ini`
- Create: `backend/alembic/env.py`
- Create: `backend/alembic/script.py.mako`
- Create: `backend/alembic/versions/001_initial.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Create `alembic.ini`**

```ini
[alembic]
script_location = alembic
# URL set programmatically in env.py from app settings
sqlalchemy.url =

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
datefmt = %H:%M:%S
```

- [ ] **Step 2: Create `alembic/env.py` with async support**

```python
from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.core.database import Base

# Import all models so Base.metadata knows about them
import app.models.models  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — generates SQL without a live connection."""
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations in 'online' mode — uses async engine."""
    connectable = create_async_engine(settings.DATABASE_URL)

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
```

- [ ] **Step 3: Create `alembic/script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

# revision identifiers, used by Alembic.
revision: str = ${repr(up_revision)}
down_revision: Union[str, None] = ${repr(down_revision)}
branch_labels: Union[str, Sequence[str], None] = ${repr(branch_labels)}
depends_on: Union[str, Sequence[str], None] = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 4: Create `alembic/versions/001_initial.py`**

```python
"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-03-10
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "agents",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("system_prompt", sa.Text(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "councils",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("rounds", sa.Integer(), nullable=True),
        sa.Column("voting_mechanism", sa.String(), nullable=True),
        sa.Column("allow_human_turns", sa.Boolean(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "council_agents",
        sa.Column("council_id", sa.Uuid(), sa.ForeignKey("councils.id"), nullable=False),
        sa.Column("agent_id", sa.Uuid(), sa.ForeignKey("agents.id"), nullable=False),
        sa.PrimaryKeyConstraint("council_id", "agent_id"),
    )

    op.create_table(
        "sessions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("council_id", sa.Uuid(), sa.ForeignKey("councils.id"), nullable=False),
        sa.Column("input_claim", sa.Text(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "rounds",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("round_id", sa.Uuid(), sa.ForeignKey("rounds.id"), nullable=False),
        sa.Column("agent_id", sa.Uuid(), sa.ForeignKey("agents.id"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "votes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), sa.ForeignKey("sessions.id"), nullable=False),
        sa.Column("agent_id", sa.Uuid(), sa.ForeignKey("agents.id"), nullable=False),
        sa.Column("value", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("reasoning", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "verdicts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("session_id", sa.Uuid(), sa.ForeignKey("sessions.id"), nullable=False, unique=True),
        sa.Column("decision", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("verdicts")
    op.drop_table("votes")
    op.drop_table("messages")
    op.drop_table("rounds")
    op.drop_table("sessions")
    op.drop_table("council_agents")
    op.drop_table("councils")
    op.drop_table("agents")
```

- [ ] **Step 5: Update `main.py` lifespan to run Alembic migrations**

Replace `create_all()` with:
```python
from pathlib import Path
from alembic.config import Config
from alembic import command

# Resolve alembic.ini relative to the backend/ directory (two levels up from main.py)
alembic_ini = Path(__file__).resolve().parent.parent / "alembic.ini"
alembic_cfg = Config(str(alembic_ini))
command.upgrade(alembic_cfg, "head")
```

- [ ] **Step 6: Run existing tests to verify nothing breaks**

Run: `cd /Users/shost/workspaces/ethora && ./test-backend.sh`
Expected: all tests pass. Tests use their own `create_all()` in `conftest.py` fixtures (not the app lifespan), so replacing the lifespan code does not affect them.

- [ ] **Step 7: Commit**

```bash
git add backend/alembic.ini backend/alembic/ backend/app/main.py
git commit -m "infra: set up Alembic migrations replacing create_all()"
```

---

## Task 3: Add Pagination to List Endpoints

**Files:**
- Modify: `backend/app/api/v1/councils.py:32-36,61-66`
- Modify: `backend/tests/test_api_councils.py`

- [ ] **Step 1: Write failing pagination tests**

Add to `TestAgentEndpoints`:
```python
async def test_list_agents_pagination(self, client: AsyncClient) -> None:
    for i in range(3):
        await client.post(
            "/api/v1/agents",
            json={"name": f"Agent {i}", "system_prompt": f"Prompt {i}"},
        )
    resp = await client.get("/api/v1/agents", params={"limit": 2})
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    resp = await client.get("/api/v1/agents", params={"skip": 2})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
```

Add to `TestCouncilEndpoints`:
```python
async def test_list_councils_pagination(self, client: AsyncClient, two_agents: list[str]) -> None:
    for i in range(3):
        await client.post(
            "/api/v1/councils",
            json={"name": f"Council {i}", "agent_ids": two_agents},
        )
    resp = await client.get("/api/v1/councils", params={"limit": 2})
    assert resp.status_code == 200
    assert len(resp.json()) == 2

    resp = await client.get("/api/v1/councils", params={"skip": 2})
    assert resp.status_code == 200
    assert len(resp.json()) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `./test-backend.sh tests/test_api_councils.py -v`
Expected: pagination tests FAIL

- [ ] **Step 3: Add pagination to `list_agents`**

```python
@router.get("/agents", response_model=list[AgentResponse])
async def list_agents(db: DBSession, skip: int = 0, limit: int = 50) -> list[Agent]:
    result = await db.execute(select(Agent).offset(skip).limit(limit))
    return list(result.scalars().all())
```

- [ ] **Step 4: Add pagination to `list_councils`**

```python
@router.get("/councils", response_model=list[CouncilResponse])
async def list_councils(db: DBSession, skip: int = 0, limit: int = 50) -> list[Council]:
    result = await db.execute(
        select(Council).options(selectinload(Council.agents)).offset(skip).limit(limit)
    )
    return list(result.scalars().all())
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `./test-backend.sh tests/test_api_councils.py -v`
Expected: all tests PASS

- [ ] **Step 6: Run full test suite**

Run: `./test-backend.sh`
Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/councils.py backend/tests/test_api_councils.py
git commit -m "feat: add pagination to list_agents and list_councils endpoints"
```

---

## Final: Update TODO.md

- [ ] **Step 1: Mark infrastructure items complete in TODO.md**
- [ ] **Step 2: Commit**

```bash
git add TODO.md
git commit -m "docs: mark infrastructure tasks complete"
```
