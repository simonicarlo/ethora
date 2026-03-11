"""Add tools_enabled to councils and references to messages

Revision ID: 005
Revises: 004
Create Date: 2026-03-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "councils",
        sa.Column("tools_enabled", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "messages",
        sa.Column("references", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("messages", "references")
    op.drop_column("councils", "tools_enabled")
