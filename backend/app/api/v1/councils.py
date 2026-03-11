from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import DBSession, get_or_404
from app.models.models import Agent, Council, Session, council_agents
from app.schemas.schemas import AgentCreate, AgentResponse, AgentUpdate, CouncilCreate, CouncilResponse, CouncilUpdate

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
async def list_agents(db: DBSession, skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)) -> list[Agent]:
    result = await db.execute(select(Agent).order_by(Agent.name).offset(skip).limit(limit))
    return list(result.scalars().all())


@router.get("/agents/{agent_id}", response_model=AgentResponse)
async def get_agent(agent_id: uuid.UUID, db: DBSession) -> Agent:
    return await get_or_404(db, Agent, agent_id, "Agent not found")


@router.put("/agents/{agent_id}", response_model=AgentResponse)
async def update_agent(agent_id: uuid.UUID, payload: AgentUpdate, db: DBSession) -> Agent:
    agent = await get_or_404(db, Agent, agent_id, "Agent not found")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    await db.flush()
    return agent


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(agent_id: uuid.UUID, db: DBSession) -> None:
    agent = await get_or_404(db, Agent, agent_id, "Agent not found")

    # Check which councils contain this agent and would drop below 2 members
    result = await db.execute(
        select(Council).options(selectinload(Council.agents)).where(
            Council.agents.any(Agent.id == agent_id)
        )
    )
    councils = list(result.scalars().all())

    for council in councils:
        if len(council.agents) <= 2:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot delete agent: council '{council.name}' would have fewer than 2 agents",
            )

    # Remove from all councils' M:N relationships
    for council in councils:
        council.agents = [a for a in council.agents if a.id != agent_id]

    await db.delete(agent)
    await db.flush()


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
async def list_councils(db: DBSession, skip: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=200)) -> list[Council]:
    result = await db.execute(
        select(Council).options(selectinload(Council.agents)).order_by(Council.name).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/councils/{council_id}", response_model=CouncilResponse)
async def get_council(council_id: uuid.UUID, db: DBSession) -> Council:
    return await get_or_404(db, Council, council_id, "Council not found")


@router.put("/councils/{council_id}", response_model=CouncilResponse)
async def update_council(council_id: uuid.UUID, payload: CouncilUpdate, db: DBSession) -> Council:
    council = await get_or_404(db, Council, council_id, "Council not found")

    update_data = payload.model_dump(exclude_unset=True)

    # Handle agent_ids separately — replace the M:N relationship
    agent_ids = update_data.pop("agent_ids", None)
    if agent_ids is not None:
        result = await db.execute(select(Agent).where(Agent.id.in_(agent_ids)))
        agents = list(result.scalars().all())
        if len(agents) != len(agent_ids):
            raise HTTPException(status_code=404, detail="One or more agents not found")
        council.agents = agents

    for field, value in update_data.items():
        setattr(council, field, value)

    await db.flush()
    return council


@router.delete("/councils/{council_id}", status_code=204)
async def delete_council(council_id: uuid.UUID, db: DBSession) -> None:
    council = await get_or_404(db, Council, council_id, "Council not found")

    # Check for active sessions (not complete or error)
    result = await db.execute(
        select(Session).where(
            Session.council_id == council_id,
            Session.status.notin_(["complete", "error"]),
        )
    )
    active_session = result.scalar_one_or_none()
    if active_session is not None:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete council: active sessions exist",
        )

    await db.delete(council)
    await db.flush()
