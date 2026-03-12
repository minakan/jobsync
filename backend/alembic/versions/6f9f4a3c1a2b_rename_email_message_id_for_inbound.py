"""rename email message id for inbound webhook

Revision ID: 6f9f4a3c1a2b
Revises: 2c84c4b6a53a
Create Date: 2026-03-12 19:00:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6f9f4a3c1a2b"
down_revision: str | None = "6d1a9e9de4f2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "emails",
        "gmail_message_id",
        new_column_name="message_id",
        existing_type=sa.String(length=255),
        existing_nullable=False,
    )
    op.alter_column(
        "emails",
        "message_id",
        existing_type=sa.String(length=255),
        type_=sa.String(length=512),
        existing_nullable=False,
        nullable=True,
    )
    op.create_index("ix_emails_message_id", "emails", ["message_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_emails_message_id", table_name="emails")
    op.alter_column(
        "emails",
        "message_id",
        existing_type=sa.String(length=512),
        type_=sa.String(length=255),
        existing_nullable=True,
        nullable=False,
    )
    op.alter_column(
        "emails",
        "message_id",
        new_column_name="gmail_message_id",
        existing_type=sa.String(length=255),
        existing_nullable=False,
    )
