"""Add final_submitted_at to track when final delivery is submitted.

Revision ID: add_final_submitted_at
Revises:
Create Date: 2026-03-29 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_final_submitted_at'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contracts', sa.Column('final_submitted_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column('contracts', 'final_submitted_at')
