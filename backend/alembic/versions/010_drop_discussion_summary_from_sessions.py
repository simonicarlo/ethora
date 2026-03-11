"""Drop discussion_summary column from sessions table

The summarize_session LLM call was removed — this column is no longer written.

Revision ID: 010
Revises: 009
Create Date: 2026-03-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "010"
down_revision: Union[str, None] = "009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("sessions", "discussion_summary")


def downgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("discussion_summary", sa.Text(), nullable=True),
    )
