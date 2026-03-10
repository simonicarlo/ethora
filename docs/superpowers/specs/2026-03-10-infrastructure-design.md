# Infrastructure Tasks — Design Spec

## 1. Alembic Migrations

Replace `Base.metadata.create_all()` in `main.py` lifespan with Alembic.

- Initialize Alembic with async support (`asyncpg`)
- `env.py` imports `Base` from `app.core.database` and `settings` for the DB URL
- Generate initial migration from existing models
- Lifespan runs `alembic upgrade head` on startup (preserves zero-config DX)
- Developers can still use `alembic revision --autogenerate` for future schema changes

## 2. Pin Python Dependency Versions

Pin all dependencies in `requirements.txt` to exact versions (`==`) based on current `pip freeze` output. Prevents surprise breakage.

## 3. Pagination for List Endpoints

Add `skip` (default 0) and `limit` (default 50) query parameters to:
- `GET /api/v1/agents`
- `GET /api/v1/councils`

Uses SQLAlchemy `.offset(skip).limit(limit)`. No cursor pagination or total count needed at this scale.
