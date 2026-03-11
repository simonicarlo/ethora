"""Add icon column to agents

Revision ID: 007
Revises: 006
Create Date: 2026-03-11
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "007"
down_revision: Union[str, None] = "006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("agents", sa.Column("icon", sa.String(), nullable=True, server_default="smart_toy"))


def downgrade() -> None:
    op.drop_column("agents", "icon")
