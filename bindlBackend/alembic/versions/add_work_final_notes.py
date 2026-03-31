"""Add work_notes and final_delivery_notes to contracts table

Revision ID: add_work_final_notes
Revises: 847f6014e5b5
Create Date: 2026-03-31 19:22:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text


# revision identifiers, used by Alembic.
revision = 'add_work_final_notes'
down_revision = '847f6014e5b5'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Use raw SQL to check if columns exist before adding
    conn = op.get_bind()
    
    # Check if work_notes column exists
    result = conn.execute(text("""
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME='contracts' AND COLUMN_NAME='work_notes'
    """)).fetchone()
    
    if not result:
        op.add_column('contracts', sa.Column('work_notes', sa.Text(), nullable=True))
    
    # Check if final_delivery_notes column exists
    result = conn.execute(text("""
        SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME='contracts' AND COLUMN_NAME='final_delivery_notes'
    """)).fetchone()
    
    if not result:
        op.add_column('contracts', sa.Column('final_delivery_notes', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('contracts', 'final_delivery_notes')
    op.drop_column('contracts', 'work_notes')
