"""Add ON DELETE CASCADE to FKs and CHECK constraints on status/voting columns

Revision ID: 011
Revises: 010
Create Date: 2026-03-11
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "011"
down_revision: Union[str, None] = "010"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- CHECK constraints for validated string columns --
    op.create_check_constraint(
        "ck_councils_voting_mechanism",
        "councils",
        "voting_mechanism IN ('majority', 'weighted', 'consensus', 'human_in_loop')",
    )
    op.create_check_constraint(
        "ck_sessions_status",
        "sessions",
        "status IN ('pending', 'running', 'proposing', 'voting', 'closing_statements', 'awaiting_human_turn', 'complete', 'error', 'rate_limited')",
    )
    op.create_check_constraint(
        "ck_sessions_question_type",
        "sessions",
        "question_type IN ('binary', 'open', 'research')",
    )

    # -- ON DELETE CASCADE on foreign keys --
    # Pattern: drop old FK constraint, re-create with ondelete

    # sessions.council_id → councils.id (CASCADE)
    op.drop_constraint("sessions_council_id_fkey", "sessions", type_="foreignkey")
    op.create_foreign_key(
        "sessions_council_id_fkey", "sessions", "councils",
        ["council_id"], ["id"], ondelete="CASCADE",
    )

    # rounds.session_id → sessions.id (CASCADE)
    op.drop_constraint("rounds_session_id_fkey", "rounds", type_="foreignkey")
    op.create_foreign_key(
        "rounds_session_id_fkey", "rounds", "sessions",
        ["session_id"], ["id"], ondelete="CASCADE",
    )

    # messages.round_id → rounds.id (CASCADE)
    op.drop_constraint("messages_round_id_fkey", "messages", type_="foreignkey")
    op.create_foreign_key(
        "messages_round_id_fkey", "messages", "rounds",
        ["round_id"], ["id"], ondelete="CASCADE",
    )

    # messages.agent_id → agents.id (SET NULL — agent_id is nullable)
    op.drop_constraint("messages_agent_id_fkey", "messages", type_="foreignkey")
    op.create_foreign_key(
        "messages_agent_id_fkey", "messages", "agents",
        ["agent_id"], ["id"], ondelete="SET NULL",
    )

    # votes.session_id → sessions.id (CASCADE)
    op.drop_constraint("votes_session_id_fkey", "votes", type_="foreignkey")
    op.create_foreign_key(
        "votes_session_id_fkey", "votes", "sessions",
        ["session_id"], ["id"], ondelete="CASCADE",
    )

    # votes.agent_id → agents.id (CASCADE)
    op.drop_constraint("votes_agent_id_fkey", "votes", type_="foreignkey")
    op.create_foreign_key(
        "votes_agent_id_fkey", "votes", "agents",
        ["agent_id"], ["id"], ondelete="CASCADE",
    )

    # verdicts.session_id → sessions.id (CASCADE)
    op.drop_constraint("verdicts_session_id_fkey", "verdicts", type_="foreignkey")
    op.create_foreign_key(
        "verdicts_session_id_fkey", "verdicts", "sessions",
        ["session_id"], ["id"], ondelete="CASCADE",
    )


def downgrade() -> None:
    # -- Revert FK constraints (remove ON DELETE) --
    op.drop_constraint("verdicts_session_id_fkey", "verdicts", type_="foreignkey")
    op.create_foreign_key(
        "verdicts_session_id_fkey", "verdicts", "sessions",
        ["session_id"], ["id"],
    )

    op.drop_constraint("votes_agent_id_fkey", "votes", type_="foreignkey")
    op.create_foreign_key(
        "votes_agent_id_fkey", "votes", "agents",
        ["agent_id"], ["id"],
    )

    op.drop_constraint("votes_session_id_fkey", "votes", type_="foreignkey")
    op.create_foreign_key(
        "votes_session_id_fkey", "votes", "sessions",
        ["session_id"], ["id"],
    )

    op.drop_constraint("messages_agent_id_fkey", "messages", type_="foreignkey")
    op.create_foreign_key(
        "messages_agent_id_fkey", "messages", "agents",
        ["agent_id"], ["id"],
    )

    op.drop_constraint("messages_round_id_fkey", "messages", type_="foreignkey")
    op.create_foreign_key(
        "messages_round_id_fkey", "messages", "rounds",
        ["round_id"], ["id"],
    )

    op.drop_constraint("rounds_session_id_fkey", "rounds", type_="foreignkey")
    op.create_foreign_key(
        "rounds_session_id_fkey", "rounds", "sessions",
        ["session_id"], ["id"],
    )

    op.drop_constraint("sessions_council_id_fkey", "sessions", type_="foreignkey")
    op.create_foreign_key(
        "sessions_council_id_fkey", "sessions", "councils",
        ["council_id"], ["id"],
    )

    # -- Drop CHECK constraints --
    op.drop_constraint("ck_sessions_question_type", "sessions", type_="check")
    op.drop_constraint("ck_sessions_status", "sessions", type_="check")
    op.drop_constraint("ck_councils_voting_mechanism", "councils", type_="check")
