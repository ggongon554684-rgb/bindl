"""merge_heads

Revision ID: 29dd6fe9ad26
Revises: a1b2c3d4e5f6_add_usdc_withdrawals, add_notes_columns, b2c8e1a4f003, e7279267f10e
Create Date: 2026-03-31 19:19:31.488213

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '29dd6fe9ad26'
down_revision = ('a1b2c3d4e5f6_add_usdc_withdrawals', 'add_notes_columns', 'b2c8e1a4f003', 'e7279267f10e')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
