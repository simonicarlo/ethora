from __future__ import annotations

from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.admin import router as admin_router
from app.api.v1.councils import router as councils_router
from app.api.v1.sessions import router as sessions_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    import logging

    from app.core.config import settings

    if not settings.ANTHROPIC_API_KEY:
        logging.warning(
            "ANTHROPIC_API_KEY is not set. "
            "LLM calls will fail until a valid key is provided in .env or the environment."
        )

    # Run Alembic migrations as a subprocess to avoid event-loop conflicts
    # (env.py uses asyncio.run() which cannot nest inside the running loop).
    import asyncio
    import subprocess
    from pathlib import Path

    backend_dir = Path(__file__).resolve().parent.parent

    result = await asyncio.to_thread(
        subprocess.run,
        ["python", "-m", "alembic", "upgrade", "head"],
        cwd=str(backend_dir),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logging.error("Alembic migration failed:\n%s", result.stderr)
        raise RuntimeError("Alembic migration failed — refusing to start with an inconsistent schema")
    else:
        for line in result.stderr.strip().splitlines():
            logging.info(line)
    yield


app = FastAPI(
    title="Agent Council API",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS — restrict to configured origins (defaults to localhost:4200)
from app.core.config import settings as _settings  # noqa: E402

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(admin_router)
app.include_router(councils_router)
app.include_router(sessions_router)


@app.get("/health", tags=["system"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}
