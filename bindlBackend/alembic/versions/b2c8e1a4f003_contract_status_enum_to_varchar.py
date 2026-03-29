"""contract status: ENUM to VARCHAR(50)

Revision ID: b2c8e1a4f003
Revises: add_work_submission_fields
Create Date: 2026-03-29

"""
from alembic import op
import sqlalchemy as sa


revision = "b2c8e1a4f003"
down_revision = "add_work_submission_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "contracts",
        "status",
        existing_type=sa.Enum(
            "draft",
            "ongoing",
            "locked",
            "released",
            "disputed",
            "cancelled",
            "expired",
            name="contractstatus",
        ),
        type_=sa.String(50),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "contracts",
        "status",
        existing_type=sa.String(50),
        type_=sa.Enum(
            "draft",
            "ongoing",
            "locked",
            "released",
            "disputed",
            "cancelled",
            "expired",
            name="contractstatus",
        ),
        existing_nullable=False,
    )
