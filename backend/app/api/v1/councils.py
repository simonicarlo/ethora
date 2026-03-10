from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.api.v1.deps import DBSession
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
    await db.flush()
    return agent


@router.get("/agents", response_model=list[AgentResponse])
async def list_agents(db: DBSession) -> list[Agent]:
    result = await db.execute(select(Agent))
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
async def list_councils(db: DBSession) -> list[Council]:
    result = await db.execute(select(Council))
    return list(result.scalars().all())


@router.get("/councils/{council_id}", response_model=CouncilResponse)
async def get_council(council_id: uuid.UUID, db: DBSession) -> Council:
    result = await db.execute(select(Council).where(Council.id == council_id))
    council = result.scalar_one_or_none()
    if council is None:
        raise HTTPException(status_code=404, detail="Council not found")
    return council
