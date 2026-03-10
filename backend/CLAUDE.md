# Backend — CLAUDE.md

## Overview
FastAPI async backend for Agent Council. Serves REST API + SSE for real-time deliberation.

## Structure
- `app/main.py` — App factory, lifespan (creates tables on startup), CORS, router mounting
- `app/api/v1/` — Versioned REST endpoints (councils CRUD, session lifecycle)
- `app/core/` — Settings (pydantic-settings) and async SQLAlchemy database setup
- `app/models/` — SQLAlchemy ORM models (Agent, Council, Session, Round, Message, Vote, Verdict)
- `app/schemas/` — Pydantic request/response DTOs with Field validation
- `app/engine/` — Core deliberation logic (agent calls, round orchestration, voting)
- `app/sse/` — Server-Sent Events formatting helpers

## Key Design Choices
- **Async-first**: All DB operations and API calls use async/await via asyncpg + SQLAlchemy async
- **No token streaming**: SSE fires once per completed agent response, not per token
- **Sequential within rounds**: Agents respond one at a time so each sees all prior messages
- **Database session lifecycle**: `get_db()` yields a session, auto-commits on success, rollbacks on exception
- **PoC table creation**: `Base.metadata.create_all()` in lifespan (swap to Alembic for production)

## Testing
- Tests in `tests/` directory, run with `pytest`
- Uses `aiosqlite` for in-memory async SQLite in tests (no PostgreSQL needed)
- `conftest.py` provides `db` (AsyncSession) and `client` (httpx.AsyncClient) fixtures
- Test dependencies: pytest, pytest-asyncio, httpx, aiosqlite

## Conventions
- All functions have type annotations
- All I/O uses Pydantic models
- Secrets loaded from `.env` via pydantic-settings — never hardcoded
