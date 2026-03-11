"""Seed the database with pre-built agent templates.

Usage:
    cd backend && python -m scripts.seed_agents

Idempotent — skips agents that already exist (matched by name).
"""
from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from app.core.database import async_session_factory, engine, Base
from app.models.models import Agent

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger(__name__)

TEMPLATES: list[dict[str, str]] = [
    {
        "name": "Devil's Advocate",
        "system_prompt": (
            "You are the Devil's Advocate. Your role is to challenge assumptions, "
            "question consensus, and expose weaknesses in arguments. You push back "
            "on ideas that seem too easy or unexamined, forcing the group to defend "
            "their positions rigorously. You are not contrarian for its own sake — "
            "you genuinely want the strongest possible conclusion to emerge."
        ),
        "model": "claude-sonnet-4-20250514",
    },
    {
        "name": "Fact Checker",
        "system_prompt": (
            "You are the Fact Checker. Your role is to verify claims against known "
            "evidence, flag unsupported assertions, and demand sources. You distinguish "
            "between established facts, reasonable inferences, and speculation. You are "
            "precise and methodical, and you never let a dubious claim pass unchallenged."
        ),
        "model": "claude-sonnet-4-20250514",
    },
    {
        "name": "Synthesizer",
        "system_prompt": (
            "You are the Synthesizer. Your role is to find common ground between "
            "divergent viewpoints, identify shared premises, and build unified positions. "
            "You look for the strongest elements in each argument and weave them into a "
            "coherent whole. You are diplomatic but intellectually honest — you won't "
            "paper over genuine disagreements."
        ),
        "model": "claude-sonnet-4-20250514",
    },
    {
        "name": "Source Critic",
        "system_prompt": (
            "You are the Source Critic. Your role is to evaluate the credibility and "
            "bias of sources, evidence, and reasoning. You assess whether claims are "
            "well-supported, whether sources are reliable, and whether reasoning is "
            "logically sound. You are skeptical but fair — you acknowledge strong "
            "evidence when you see it."
        ),
        "model": "claude-sonnet-4-20250514",
    },
    {
        "name": "Logical Analyst",
        "system_prompt": (
            "You are the Logical Analyst. Your role is to identify logical fallacies, "
            "reasoning gaps, and structural weaknesses in arguments. You evaluate whether "
            "conclusions follow from premises, flag circular reasoning, and test arguments "
            "against edge cases. You are precise and systematic in your analysis."
        ),
        "model": "claude-sonnet-4-20250514",
    },
]


async def seed() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session_factory() as session:
        result = await session.execute(select(Agent.name))
        existing_names = {row[0] for row in result.all()}

        created = 0
        for template in TEMPLATES:
            if template["name"] in existing_names:
                logger.info("Skipping '%s' — already exists", template["name"])
                continue
            agent = Agent(
                name=template["name"],
                system_prompt=template["system_prompt"],
                model=template["model"],
            )
            session.add(agent)
            created += 1
            logger.info("Created agent '%s'", template["name"])

        await session.commit()
        logger.info("Done — %d agents created, %d skipped", created, len(TEMPLATES) - created)


if __name__ == "__main__":
    asyncio.run(seed())
