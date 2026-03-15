"""add time range fields to schedules

Revision ID: 8b17e9a4c2d1
Revises: 6f9f4a3c1a2b
Create Date: 2026-03-15 12:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8b17e9a4c2d1"
down_revision: str | None = "6f9f4a3c1a2b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("schedules", sa.Column("start_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("schedules", sa.Column("end_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column(
        "schedules",
        sa.Column("is_all_day", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.execute(
        sa.text(
            """
            UPDATE schedules
            SET start_at = scheduled_at,
                end_at = scheduled_at + interval '1 hour',
                is_all_day = false
            WHERE start_at IS NULL OR end_at IS NULL
            """
        )
    )

    op.alter_column("schedules", "start_at", nullable=False)
    op.alter_column("schedules", "end_at", nullable=False)
    op.create_index(
        "ix_schedules_user_id_start_at",
        "schedules",
        ["user_id", "start_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_schedules_user_id_start_at", table_name="schedules")
    op.drop_column("schedules", "is_all_day")
    op.drop_column("schedules", "end_at")
    op.drop_column("schedules", "start_at")
