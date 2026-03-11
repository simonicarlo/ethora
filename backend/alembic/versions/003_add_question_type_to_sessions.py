"""Add question_type column to sessions table

Revision ID: 003
Revises: 002
Create Date: 2026-03-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "sessions",
        sa.Column("question_type", sa.String(), server_default="binary", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("sessions", "question_type")
