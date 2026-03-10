# Core — CLAUDE.md

## Purpose
Application configuration and database connection setup.

## Key Design Choices
- **pydantic-settings**: `Settings` class auto-loads from `.env` file and environment variables
- **pool_pre_ping**: Enabled on engine to handle stale connections gracefully
- **expire_on_commit=False**: Prevents lazy-load issues after commit in async context
- **DeclarativeBase**: Modern SQLAlchemy 2.0 style (not legacy `declarative_base()`)

## Files
- `config.py` — Settings singleton, reads `ANTHROPIC_API_KEY` and `DATABASE_URL`
- `database.py` — Engine, session factory, Base class, `get_db()` dependency
