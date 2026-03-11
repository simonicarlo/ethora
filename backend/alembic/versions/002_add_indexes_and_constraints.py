"""Add indexes on foreign keys and tighten nullability constraints

Revision ID: 002
Revises: 001
Create Date: 2026-03-11
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # -- Indexes on foreign keys for query performance --
    op.create_index("ix_sessions_council_id", "sessions", ["council_id"])
    op.create_index("ix_rounds_session_id", "rounds", ["session_id"])
    op.create_index("ix_messages_round_id", "messages", ["round_id"])
    op.create_index("ix_messages_agent_id", "messages", ["agent_id"])
    op.create_index("ix_votes_session_id", "votes", ["session_id"])
    op.create_index("ix_votes_agent_id", "votes", ["agent_id"])

    # -- Tighten nullability on columns with server defaults --
    op.alter_column("sessions", "status", nullable=False, server_default="pending")
    op.alter_column("sessions", "created_at", nullable=False)
    op.alter_column("rounds", "created_at", nullable=False)
    op.alter_column("messages", "created_at", nullable=False)
    op.alter_column("verdicts", "created_at", nullable=False)


def downgrade() -> None:
    # -- Revert nullability --
    op.alter_column("verdicts", "created_at", nullable=True)
    op.alter_column("messages", "created_at", nullable=True)
    op.alter_column("rounds", "created_at", nullable=True)
    op.alter_column("sessions", "created_at", nullable=True)
    op.alter_column("sessions", "status", nullable=True, server_default=None)

    # -- Drop indexes --
    op.drop_index("ix_votes_agent_id", "votes")
    op.drop_index("ix_votes_session_id", "votes")
    op.drop_index("ix_messages_agent_id", "messages")
    op.drop_index("ix_messages_round_id", "messages")
    op.drop_index("ix_rounds_session_id", "rounds")
    op.drop_index("ix_sessions_council_id", "sessions")
