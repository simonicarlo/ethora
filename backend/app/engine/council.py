from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession


async def run_council_session(session_id: uuid.UUID, db: AsyncSession) -> None:
    """Orchestrates rounds of deliberation. TODO: implement."""
    raise NotImplementedError("Council deliberation engine not yet implemented")
