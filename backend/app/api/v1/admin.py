"""Admin endpoints: stats, settings CRUD, error logs."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.deps import get_db
from app.core.encryption import decrypt_value, encrypt_value
from app.models.models import (
    Agent,
    AppSetting,
    Council,
    Message,
    Round,
    Session,
    Verdict,
    Vote,
)
from app.schemas.schemas import (
    ALLOWED_SETTING_KEYS,
    SENSITIVE_KEYS,
    AgentMetricItem,
    AgentStatsResponse,
    CouncilStatsResponse,
    CouncilUsageItem,
    DailyCount,
    ErrorLogEntry,
    SessionStatsResponse,
    SettingResponse,
    SettingUpdate,
)

# TODO: Add authentication/authorization to admin endpoints before production use.
# Currently open to all requests — acceptable for PoC but must be locked down.
router = APIRouter(prefix="/api/v1/admin", tags=["admin"])


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


@router.get("/stats/sessions", response_model=SessionStatsResponse)
async def session_stats(db: AsyncSession = Depends(get_db)) -> SessionStatsResponse:
    # Total sessions
    total = (await db.execute(select(func.count(Session.id)))).scalar_one()

    # By status
    rows = (await db.execute(
        select(Session.status, func.count(Session.id)).group_by(Session.status)
    )).all()
    by_status: dict[str, int] = {status: count for status, count in rows}

    # Completion rate
    completed = by_status.get("complete", 0)
    completion_rate = (completed / total * 100) if total > 0 else 0.0

    # Avg rounds per session — subquery to count rounds per session, then avg
    round_counts = (
        select(func.count(Round.id).label("cnt"))
        .where(Round.session_id == Session.id)
        .correlate(Session)
        .scalar_subquery()
    )
    avg_rounds_result = (await db.execute(
        select(func.avg(round_counts)).select_from(Session)
    )).scalar_one()
    avg_rounds = float(avg_rounds_result) if avg_rounds_result else 0.0

    # Sessions over last 30 days
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    time_rows = (await db.execute(
        select(
            func.date(Session.created_at).label("day"),
            func.count(Session.id),
        )
        .where(Session.created_at >= thirty_days_ago)
        .group_by(func.date(Session.created_at))
        .order_by(func.date(Session.created_at))
    )).all()
    sessions_over_time = [DailyCount(date=str(day), count=cnt) for day, cnt in time_rows]

    return SessionStatsResponse(
        total_sessions=total,
        sessions_by_status=by_status,
        completion_rate=round(completion_rate, 1),
        avg_rounds_per_session=round(avg_rounds, 1),
        sessions_over_time=sessions_over_time,
    )


@router.get("/stats/councils", response_model=CouncilStatsResponse)
async def council_stats(db: AsyncSession = Depends(get_db)) -> CouncilStatsResponse:
    # Session count per council + fetch timestamps for duration calc
    rows = (await db.execute(
        select(
            Council.id,
            Council.name,
            func.count(Session.id).label("session_count"),
        )
        .outerjoin(Session, Session.council_id == Council.id)
        .group_by(Council.id, Council.name)
    )).all()

    usage: list[CouncilUsageItem] = []
    for council_id, council_name, session_count in rows:
        # Compute avg deliberation time in Python for SQLite compat
        avg_seconds = 0.0
        if session_count > 0:
            sessions_with_verdict = (await db.execute(
                select(Session.created_at, Verdict.created_at)
                .join(Verdict, Verdict.session_id == Session.id)
                .where(Session.council_id == council_id)
            )).all()
            if sessions_with_verdict:
                durations = [
                    (v_created - s_created).total_seconds()
                    for s_created, v_created in sessions_with_verdict
                ]
                avg_seconds = sum(durations) / len(durations)

        usage.append(CouncilUsageItem(
            council_id=council_id,
            council_name=council_name,
            session_count=session_count,
            avg_deliberation_seconds=round(avg_seconds, 1),
        ))

    return CouncilStatsResponse(council_usage=usage)


@router.get("/stats/agents", response_model=AgentStatsResponse)
async def agent_stats(db: AsyncSession = Depends(get_db)) -> AgentStatsResponse:
    # Message count + avg length per agent
    msg_rows = (await db.execute(
        select(
            Agent.id,
            Agent.name,
            func.count(Message.id).label("msg_count"),
            func.avg(func.length(Message.content)).label("avg_len"),
        )
        .outerjoin(Message, Message.agent_id == Agent.id)
        .group_by(Agent.id, Agent.name)
    )).all()

    metrics: list[AgentMetricItem] = []
    for agent_id, agent_name, msg_count, avg_len in msg_rows:
        # Voting alignment: % of votes matching the verdict decision
        alignment = 0.0
        if msg_count > 0:
            alignment_result = (await db.execute(
                select(
                    func.sum(
                        case(
                            (Vote.value == Verdict.decision, 1),
                            else_=0,
                        )
                    ),
                    func.count(Vote.id),
                )
                .join(Verdict, Verdict.session_id == Vote.session_id)
                .where(Vote.agent_id == agent_id)
            )).one()
            aligned, total_votes = alignment_result
            if total_votes and total_votes > 0:
                alignment = round((aligned or 0) / total_votes * 100, 1)

        metrics.append(AgentMetricItem(
            agent_id=agent_id,
            agent_name=agent_name,
            message_count=msg_count,
            avg_message_length=round(float(avg_len or 0), 1),
            voting_alignment=alignment,
        ))

    return AgentStatsResponse(agent_metrics=metrics)


# ---------------------------------------------------------------------------
# Error Logs
# ---------------------------------------------------------------------------


@router.get("/logs/errors", response_model=list[ErrorLogEntry])
async def error_logs(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
) -> list[ErrorLogEntry]:
    rows = (await db.execute(
        select(
            Session.id,
            Council.name,
            Session.input_claim,
            Session.status,
            Session.created_at,
        )
        .join(Council, Council.id == Session.council_id)
        .where(Session.status == "error")
        .order_by(Session.created_at.desc())
        .limit(limit)
    )).all()

    entries: list[ErrorLogEntry] = []
    for sid, cname, claim, _status, created in rows:
        # Try to extract actual error from the last message in the session
        last_msg_result = await db.execute(
            select(Message.content)
            .join(Round, Round.id == Message.round_id)
            .where(Round.session_id == sid)
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        last_msg = last_msg_result.scalar_one_or_none()
        error_message = last_msg if last_msg else "Session ended with status: error"

        entries.append(ErrorLogEntry(
            session_id=sid,
            council_name=cname,
            input_claim=claim,
            error_message=error_message,
            created_at=created,
        ))

    return entries


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------


@router.get("/settings", response_model=list[SettingResponse])
async def list_settings(db: AsyncSession = Depends(get_db)) -> list[SettingResponse]:
    rows = (await db.execute(
        select(AppSetting).order_by(AppSetting.key)
    )).scalars().all()

    results: list[SettingResponse] = []
    for s in rows:
        try:
            value = decrypt_value(s.encrypted_value)
        except Exception:
            value = "<decryption error>"
        if s.key in SENSITIVE_KEYS:
            value = value[:4] + "****" if len(value) > 4 else "****"
        results.append(SettingResponse(key=s.key, value=value, updated_at=s.updated_at))
    return results


@router.put("/settings/{key}", response_model=SettingResponse)
async def update_setting(
    key: str,
    body: SettingUpdate,
    db: AsyncSession = Depends(get_db),
) -> SettingResponse:
    if key not in ALLOWED_SETTING_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: '{key}'")
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()

    encrypted = encrypt_value(body.value)

    if setting:
        setting.encrypted_value = encrypted
    else:
        setting = AppSetting(key=key, encrypted_value=encrypted)
        db.add(setting)

    await db.flush()
    await db.refresh(setting)

    display_value = body.value
    if key in SENSITIVE_KEYS:
        display_value = display_value[:4] + "****" if len(display_value) > 4 else "****"

    return SettingResponse(key=setting.key, value=display_value, updated_at=setting.updated_at)


@router.delete("/settings/{key}", status_code=204)
async def delete_setting(
    key: str,
    db: AsyncSession = Depends(get_db),
) -> None:
    if key not in ALLOWED_SETTING_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown setting key: '{key}'")
    result = await db.execute(select(AppSetting).where(AppSetting.key == key))
    setting = result.scalar_one_or_none()
    if not setting:
        raise HTTPException(status_code=404, detail=f"Setting '{key}' not found")
    await db.delete(setting)
