from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator

import anthropic
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.agent import call_agent
from app.engine.moderator import deduplicate_candidates
from app.engine.prompts.loader import (
    render_candidate_proposal,
    render_continuation_nudge,
    render_deliberation_system,
    render_voting_prompt,
)
from app.engine.voting import HumanVoteRequired, tally_votes
from app.models.models import Agent, Council, Message, Round, Session, Verdict, Vote
from app.sse.emitter import format_sse

logger = logging.getLogger(__name__)


async def run_council_session(
    session_id: uuid.UUID, db: AsyncSession
) -> AsyncGenerator[str, None]:
    """Orchestrates rounds of deliberation, yielding SSE events."""

    # -- Load session with council + agents --
    result = await db.execute(
        select(Session)
        .where(Session.id == session_id)
        .options(
            selectinload(Session.council).selectinload(Council.agents),
        )
    )
    session = result.scalar_one()
    council: Council = session.council
    agents: list[Agent] = council.agents
    agent_names = ", ".join(a.name for a in agents)

    try:
        # -- Mark running --
        session.status = "running"
        await db.flush()

        # -- Determine resume point --
        existing_rounds_result = await db.execute(
            select(Round)
            .where(Round.session_id == session.id)
            .order_by(Round.round_number)
        )
        existing_rounds = existing_rounds_result.scalars().all()
        start_round = len(existing_rounds) + 1

        # Rebuild history from DB if resuming
        if existing_rounds:
            history = await _load_history_from_db(db, session.id)
        else:
            history: list[tuple[str, uuid.UUID | None, str]] = []

        # -- Round loop --
        for round_num in range(start_round, council.rounds + 1):
            db_round = Round(session_id=session.id, round_number=round_num)
            db.add(db_round)
            await db.flush()

            for agent in agents:
                messages = _build_agent_messages(history, agent, session.input_claim)
                system_prompt = render_deliberation_system(
                    council_name=council.name,
                    agent_name=agent.name,
                    agent_list=agent_names,
                    voting_mechanism=council.voting_mechanism,
                    rounds=council.rounds,
                    agent_system_prompt=agent.system_prompt,
                )
                content = await call_agent(agent, messages, system_prompt)

                msg = Message(
                    round_id=db_round.id,
                    agent_id=agent.id,
                    content=content,
                )
                db.add(msg)
                await db.flush()

                history.append((agent.name, agent.id, content))

                yield format_sse("agent_message", {
                    "agent_id": str(agent.id),
                    "agent_name": agent.name,
                    "round": round_num,
                    "content": content,
                })

            yield format_sse("round_complete", {"round": round_num})

            # -- Human turn pause (skip last round so voting can proceed) --
            if council.allow_human_turns and round_num < council.rounds:
                session.status = "awaiting_human_turn"
                await db.commit()
                yield format_sse("awaiting_human_turn", {
                    "round": round_num,
                    "message": "Waiting for human input",
                })
                return

        # -- Build debate text (shared by proposal + voting) --
        debate_lines = []
        for name, _, content_text in history:
            debate_lines.append(f"[{name}]: {content_text}")
        debate_text = "\n\n".join(debate_lines)

        # -- Candidate proposal phase (open-ended only) --
        finalized_candidates: list[str] | None = None
        if session.question_type == "open":
            session.status = "proposing"
            await db.flush()

            raw_proposals: list[dict[str, object]] = []
            for agent in agents:
                proposal_prompt = render_candidate_proposal(
                    input_claim=session.input_claim,
                    debate_text=debate_text,
                )
                proposal_messages = [{"role": "user", "content": proposal_prompt}]
                proposal_system = render_deliberation_system(
                    council_name=council.name,
                    agent_name=agent.name,
                    agent_list=agent_names,
                    voting_mechanism=council.voting_mechanism,
                    rounds=council.rounds,
                    agent_system_prompt=agent.system_prompt,
                )
                raw_proposal = await call_agent(agent, proposal_messages, proposal_system)
                agent_candidates = _parse_candidates(raw_proposal)

                raw_proposals.append({
                    "agent_id": str(agent.id),
                    "agent_name": agent.name,
                    "candidates": agent_candidates,
                })

                yield format_sse("candidate_proposed", {
                    "agent_id": str(agent.id),
                    "agent_name": agent.name,
                    "candidates": agent_candidates,
                })

            # Moderator deduplication
            moderator_result = await deduplicate_candidates(
                raw_candidates=raw_proposals,  # type: ignore[arg-type]
                input_claim=session.input_claim,
            )
            finalized_candidates = moderator_result.candidates

            yield format_sse("moderator_action", {
                "action": moderator_result.action,
                "explanation": moderator_result.explanation,
            })
            yield format_sse("candidates_finalized", {
                "candidates": finalized_candidates,
            })

        # -- Voting phase --
        session.status = "voting"
        await db.flush()

        question_type = session.question_type or "binary"
        voting_prompt = render_voting_prompt(
            input_claim=session.input_claim,
            debate_text=debate_text,
            question_type=question_type,  # type: ignore[arg-type]
            candidates=finalized_candidates,
        )

        votes: list[Vote] = []
        for agent in agents:
            vote_messages = [{"role": "user", "content": voting_prompt}]
            vote_system_prompt = render_deliberation_system(
                council_name=council.name,
                agent_name=agent.name,
                agent_list=agent_names,
                voting_mechanism=council.voting_mechanism,
                rounds=council.rounds,
                agent_system_prompt=agent.system_prompt,
            )
            raw_vote = await call_agent(agent, vote_messages, vote_system_prompt)
            parsed = _parse_vote(raw_vote)

            try:
                confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.0))))
            except (TypeError, ValueError):
                confidence = 0.0

            vote = Vote(
                session_id=session.id,
                agent_id=agent.id,
                value=parsed.get("value", "abstain"),
                confidence=confidence,
                reasoning=parsed.get("reasoning"),
            )
            db.add(vote)
            await db.flush()
            votes.append(vote)

            yield format_sse("voting_cast", {
                "agent_id": str(agent.id),
                "agent_name": agent.name,
                "vote": vote.value,
                "confidence": vote.confidence,
                "reasoning": vote.reasoning,
            })

        # -- Tally --
        try:
            tally = await tally_votes(votes, council.voting_mechanism)  # type: ignore[arg-type]
        except HumanVoteRequired:
            yield format_sse("awaiting_human_vote", {
                "message": "Waiting for human to cast deciding vote",
            })
            await db.commit()
            return

        verdict = Verdict(
            session_id=session.id,
            decision=tally["decision"],
            confidence=tally.get("confidence"),
            summary=tally.get("summary"),
        )
        db.add(verdict)
        session.status = "complete"
        await db.flush()

        yield format_sse("verdict", {
            "decision": str(tally["decision"]),
            "confidence": tally.get("confidence"),
            "summary": tally.get("summary"),
        })

        await db.commit()

    except (anthropic.APIError, SQLAlchemyError) as exc:
        logger.exception("Council session %s failed", session_id)
        await db.rollback()
        session.status = "error"
        await db.commit()
        yield format_sse("error", {"message": str(exc) or "Internal engine error"})


def _build_agent_messages(
    history: list[tuple[str, uuid.UUID | None, str]],
    current_agent: Agent,
    input_claim: str,
) -> list[dict[str, str]]:
    """Converts debate history to Claude-compatible message list.

    - Current agent's own prior responses -> "assistant" role
    - Other agents' responses -> "user" role with [AgentName]: prefix
    - The input claim is always the first user message
    - Consecutive same-role messages are merged (Claude API constraint)
    """
    messages: list[dict[str, str]] = [
        {"role": "user", "content": f"[Debate Topic]: {input_claim}"},
    ]

    for name, agent_id, content in history:
        if agent_id is not None and agent_id == current_agent.id:
            role = "assistant"
            text = content
        else:
            role = "user"
            text = f"[{name}]: {content}"

        # Merge consecutive same-role messages
        if messages and messages[-1]["role"] == role:
            messages[-1]["content"] += f"\n\n{text}"
        else:
            messages.append({"role": role, "content": text})

    # If last message is assistant, add a continuation nudge
    if messages and messages[-1]["role"] == "assistant":
        messages.append({
            "role": "user",
            "content": render_continuation_nudge(),
        })

    return messages



def _parse_candidates(raw_text: str) -> list[str]:
    """Parse JSON candidates array from agent response, with fallback."""
    text = raw_text.strip()
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            parsed = json.loads(text[start:end + 1])
            candidates = parsed.get("candidates", [])
            if isinstance(candidates, list) and all(isinstance(c, str) for c in candidates):
                return candidates
        except json.JSONDecodeError:
            pass

    # Fallback: treat entire response as a single candidate
    logger.warning("Failed to parse candidates JSON, using raw text: %.200s", raw_text)
    return [raw_text.strip()[:200]]


def _parse_vote(raw_text: str) -> dict:
    """Parse JSON vote from agent response, with fallback."""
    text = raw_text.strip()
    # Try to extract JSON from the response
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(text[start:end + 1])
        except json.JSONDecodeError:
            pass

    # Fallback: treat entire response as reasoning
    logger.warning("Failed to parse vote JSON, falling back to abstain: %.200s", raw_text)
    return {"value": "abstain", "confidence": 0.0, "reasoning": raw_text}


async def _load_history_from_db(
    db: AsyncSession,
    session_id: uuid.UUID,
) -> list[tuple[str, uuid.UUID | None, str]]:
    """Rebuild debate history from persisted messages.

    Returns the same (name, agent_id, content) tuple format used by the
    in-memory history. Human messages have agent_id=None and name="Human".
    """
    result = await db.execute(
        select(Message)
        .join(Round, Message.round_id == Round.id)
        .where(Round.session_id == session_id)
        .options(selectinload(Message.agent))
        .order_by(Round.round_number, Message.created_at)
    )
    messages = result.scalars().all()

    history: list[tuple[str, uuid.UUID | None, str]] = []
    for msg in messages:
        if msg.agent_id is None:
            history.append(("Human", None, msg.content))
        else:
            history.append((msg.agent.name, msg.agent_id, msg.content))
    return history
