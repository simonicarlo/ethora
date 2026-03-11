from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import DBSession, build_session_list, get_or_404
from app.models.models import Agent, Council, Session, council_agents
from app.engine.agent import call_agent
from app.schemas.schemas import (
    AgentCreate,
    AgentResponse,
    AgentTestRequest,
    AgentTestResponse,
    AgentUpdate,
    CouncilCreate,
    CouncilResponse,
    CouncilUpdate,
    SessionListItem,
)

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
    for field in payload.model_fields_set:
        setattr(agent, field, getattr(payload, field))
    await db.flush()
    return agent


@router.delete("/agents/{agent_id}", status_code=204)
async def delete_agent(agent_id: uuid.UUID, db: DBSession) -> Response:
    agent = await get_or_404(db, Agent, agent_id, "Agent not found")

    # Check if removing this agent would leave any council with <2 agents
    count_query = (
        select(council_agents.c.council_id, func.count().label("agent_count"))
        .where(council_agents.c.council_id.in_(
            select(council_agents.c.council_id).where(council_agents.c.agent_id == agent_id)
        ))
        .group_by(council_agents.c.council_id)
        .having(func.count() <= 2)
    )
    result = await db.execute(count_query)
    blocking_councils = result.all()

    if blocking_councils:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete agent: removal would leave a council with fewer than 2 agents",
        )

    # Remove from council_agents associations
    await db.execute(council_agents.delete().where(council_agents.c.agent_id == agent_id))
    await db.delete(agent)
    await db.flush()
    return Response(status_code=204)


@router.post("/agents/{agent_id}/test", response_model=AgentTestResponse)
async def test_agent(agent_id: uuid.UUID, payload: AgentTestRequest, db: DBSession) -> AgentTestResponse:
    agent = await get_or_404(db, Agent, agent_id, "Agent not found")
    try:
        response_text = await call_agent(
            agent=agent,
            messages=[{"role": "user", "content": payload.message}],
            system_prompt=agent.system_prompt,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {exc}") from exc
    return AgentTestResponse(response=response_text)


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
        tools_enabled=payload.tools_enabled,
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
    return await get_or_404(
        db, Council, council_id, "Council not found",
        options=[selectinload(Council.agents)],
    )


@router.put("/councils/{council_id}", response_model=CouncilResponse)
async def update_council(council_id: uuid.UUID, payload: CouncilUpdate, db: DBSession) -> Council:
    council = await get_or_404(
        db, Council, council_id, "Council not found",
        options=[selectinload(Council.agents)],
    )
    # Apply scalar field updates from provided fields only
    for field in payload.model_fields_set - {"agent_ids"}:
        setattr(council, field, getattr(payload, field))
    # Handle agent_ids separately — requires DB lookup
    if "agent_ids" in payload.model_fields_set:
        assert payload.agent_ids is not None  # guaranteed by model_fields_set check
        result = await db.execute(select(Agent).where(Agent.id.in_(payload.agent_ids)))
        agents = list(result.scalars().all())
        if len(agents) != len(payload.agent_ids):
            raise HTTPException(status_code=404, detail="One or more agents not found")
        council.agents = agents
    await db.flush()
    return council


@router.delete("/councils/{council_id}", status_code=204)
async def delete_council(council_id: uuid.UUID, db: DBSession) -> Response:
    council = await get_or_404(db, Council, council_id, "Council not found")
    active_query = select(func.count()).select_from(Session).where(
        Session.council_id == council_id,
        Session.status.notin_(["complete", "error"]),
    )
    result = await db.execute(active_query)
    active_count = result.scalar_one()
    if active_count > 0:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete council: it has active sessions",
        )
    council.agents = []
    await db.delete(council)
    await db.flush()
    return Response(status_code=204)


# ── Council Sessions ───────────────────────────────────────────────────────

@router.get("/councils/{council_id}/sessions", response_model=list[SessionListItem])
async def list_council_sessions(
    council_id: uuid.UUID,
    db: DBSession,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
) -> list[SessionListItem]:
    """List all sessions for a specific council, ordered by created_at desc."""
    await get_or_404(db, Council, council_id, "Council not found")
    return await build_session_list(
        db, council_id=council_id, skip=skip, limit=limit,
    )
