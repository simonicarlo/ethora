"""Add app_settings table and performance indexes

Revision ID: 006
Revises: 005
Create Date: 2026-03-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("key", sa.String(), unique=True, nullable=False),
        sa.Column("encrypted_value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_status", "sessions", ["status"])
    op.create_index("ix_sessions_created_at", "sessions", ["created_at"])
    op.create_index("ix_messages_created_at", "messages", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_messages_created_at", table_name="messages")
    op.drop_index("ix_sessions_created_at", table_name="sessions")
    op.drop_index("ix_sessions_status", table_name="sessions")
    op.drop_table("app_settings")
