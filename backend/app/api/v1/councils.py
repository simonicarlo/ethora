from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import DBSession, get_or_404
from app.models.models import Agent, Council, council_agents
from app.schemas.schemas import AgentCreate, AgentResponse, CouncilCreate, CouncilResponse

router = APIRouter(prefix="/api/v1", tags=["councils"])


# ── Agents ──────────────────────────────────────────────────────────────────

@router.post("/agents", response_model=AgentResponse, status_code=201)
async def create_agent(payload: AgentCreate, db: DBSession) -> Agent:
    agent = Agent(
        name=payload.name,
        system_prompt=payload.system_prompt,
        model=payload.model,
    )
    db.add(agent)
    # flush() (not commit): writes to DB to populate generated IDs, but defers
    # the final commit to the get_db dependency's transaction lifecycle.
    await db.flush()
    return agent


@router.get("/agents", response_model=list[AgentResponse])
async def list_agents(db: DBSession, skip: int = 0, limit: int = 50) -> list[Agent]:
    result = await db.execute(select(Agent).offset(skip).limit(limit))
    return list(result.scalars().all())


# ── Councils ────────────────────────────────────────────────────────────────

@router.post("/councils", response_model=CouncilResponse, status_code=201)
async def create_council(payload: CouncilCreate, db: DBSession) -> Council:
    # Fetch requested agents
    result = await db.execute(select(Agent).where(Agent.id.in_(payload.agent_ids)))
    agents = list(result.scalars().all())

    if len(agents) != len(payload.agent_ids):
        raise HTTPException(status_code=404, detail="One or more agents not found")

    council = Council(
        name=payload.name,
        rounds=payload.rounds,
        voting_mechanism=payload.voting_mechanism,
        allow_human_turns=payload.allow_human_turns,
        agents=agents,
    )
    db.add(council)
    await db.flush()
    return council


@router.get("/councils", response_model=list[CouncilResponse])
async def list_councils(db: DBSession, skip: int = 0, limit: int = 50) -> list[Council]:
    result = await db.execute(
        select(Council).options(selectinload(Council.agents)).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/councils/{council_id}", response_model=CouncilResponse)
async def get_council(council_id: uuid.UUID, db: DBSession) -> Council:
    return await get_or_404(db, Council, council_id, "Council not found")
