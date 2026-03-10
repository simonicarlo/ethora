from __future__ import annotations

import json
import logging
import uuid
from collections.abc import AsyncGenerator

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.engine.agent import call_agent
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

    try:
        # -- Mark running --
        session.status = "running"
        await db.flush()

        # Conversation history: list of (agent_name, agent_id, content)
        history: list[tuple[str, uuid.UUID, str]] = []

        # -- Round loop --
        for round_num in range(1, council.rounds + 1):
            db_round = Round(session_id=session.id, round_number=round_num)
            db.add(db_round)
            await db.flush()

            for agent in agents:
                messages = _build_agent_messages(history, agent, session.input_claim)
                content = await call_agent(agent, messages, agent.system_prompt)

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

        # -- Voting phase --
        session.status = "voting"
        await db.flush()

        votes: list[Vote] = []
        for agent in agents:
            voting_prompt = _build_voting_prompt(session.input_claim, history)
            vote_messages = [{"role": "user", "content": voting_prompt}]
            raw_vote = await call_agent(agent, vote_messages, agent.system_prompt)
            parsed = _parse_vote(raw_vote)

            try:
                confidence = float(parsed.get("confidence", 0.0))
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

    except Exception:
        logger.exception("Council session %s failed", session_id)
        await db.rollback()
        session.status = "error"
        await db.commit()
        yield format_sse("error", {"message": "Internal engine error"})


def _build_agent_messages(
    history: list[tuple[str, uuid.UUID, str]],
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
        if agent_id == current_agent.id:
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
            "content": "Please continue the discussion. Respond to the points raised by other agents.",
        })

    return messages


def _build_voting_prompt(
    input_claim: str,
    history: list[tuple[str, uuid.UUID, str]],
) -> str:
    """Summarizes the debate and asks the agent to vote."""
    debate_lines = []
    for name, _, content in history:
        debate_lines.append(f"[{name}]: {content}")

    debate_text = "\n\n".join(debate_lines)

    return (
        f"The council has finished deliberating on the following claim:\n\n"
        f'"{input_claim}"\n\n'
        f"Here is the full debate:\n\n{debate_text}\n\n"
        f"Based on the deliberation, please cast your vote. "
        f"Respond with ONLY a JSON object in this exact format:\n"
        f'{{"value": "true" or "false", "confidence": 0.0 to 1.0, "reasoning": "your reasoning"}}\n'
        f"Do not include any other text outside the JSON."
    )


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
    return {"value": "abstain", "confidence": 0.0, "reasoning": raw_text}
