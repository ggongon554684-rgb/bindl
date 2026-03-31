"""Add work_notes and final_delivery_notes columns to contracts table.

Revision ID: add_notes_columns
Revises: add_final_submitted_at
Create Date: 2026-03-31 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_notes_columns'
down_revision = 'add_final_submitted_at'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('contracts', sa.Column('work_notes', sa.Text(), nullable=True))
    op.add_column('contracts', sa.Column('final_delivery_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('contracts', 'final_delivery_notes')
    op.drop_column('contracts', 'work_notes')
