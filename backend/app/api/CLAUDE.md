# API Layer — CLAUDE.md

## Purpose
Versioned REST API endpoints. Currently only `v1/`.

## Key Patterns
- **Dependency injection**: `DBSession` type alias wraps `Depends(get_db)` for cleaner signatures
- **Response models**: Every endpoint declares `response_model` for automatic serialization
- **Error handling**: Uses `HTTPException` with standard codes (404, 409)
- **Flush not commit**: Endpoints call `db.flush()` to get IDs; the `get_db` dependency auto-commits

## Endpoints
- `councils.py` — Agent CRUD + Council CRUD (POST/GET)
- `sessions.py` — Session lifecycle (create, get, stream SSE, human-turn, human-vote, verdict)
- `deps.py` — Shared dependency definitions (DBSession alias)
