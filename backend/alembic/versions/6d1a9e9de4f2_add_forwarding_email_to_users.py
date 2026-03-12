"""add forwarding_email to users

Revision ID: 6d1a9e9de4f2
Revises: 2c84c4b6a53a
Create Date: 2026-03-12 00:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6d1a9e9de4f2"
down_revision: str | None = "2c84c4b6a53a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("forwarding_email", sa.String(length=255), nullable=True),
    )
    op.create_unique_constraint(
        "uq_users_forwarding_email",
        "users",
        ["forwarding_email"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_users_forwarding_email", "users", type_="unique")
    op.drop_column("users", "forwarding_email")
