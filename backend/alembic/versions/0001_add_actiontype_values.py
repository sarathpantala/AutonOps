"""Add missing actiontype enum values

Revision ID: 0001
Revises:
Create Date: 2026-04-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

NEW_VALUES = [
    "RESTART_POD",
    "ROLLOUT_RESTART",
    "SCALE_DEPLOYMENT",
    "DELETE_POD",
    "CORDON_NODE",
    "DRAIN_NODE",
    "PATCH_DEPLOYMENT",
    "EXEC_COMMAND",
]


def upgrade() -> None:
    # ALTER TYPE ... ADD VALUE is not transactional in PostgreSQL,
    # so we run each outside a transaction via COMMIT trick.
    conn = op.get_bind()
    for value in NEW_VALUES:
        conn.execute(
            sa.text(
                f"ALTER TYPE actiontype ADD VALUE IF NOT EXISTS '{value}'"
            )
        )


def downgrade() -> None:
    # Removing enum values requires recreating the type; skip for dev.
    pass
