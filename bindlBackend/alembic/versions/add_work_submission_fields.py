"""add work submission fields

Revision ID: add_work_submission_fields
Revises: f7f5934c8991
Create Date: 2026-03-29 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_work_submission_fields'
down_revision = 'f7f5934c8991'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add agreement timestamps
    op.add_column('contracts', sa.Column('party_a_agreed_at', sa.DateTime(), nullable=True))
    op.add_column('contracts', sa.Column('party_b_agreed_at', sa.DateTime(), nullable=True))
    
    # Add work submission tracking
    op.add_column('contracts', sa.Column('work_submitted_at', sa.DateTime(), nullable=True))
    op.add_column('contracts', sa.Column('work_submitted_by', sa.String(36), nullable=True))
    op.add_column('contracts', sa.Column('work_approved_at', sa.DateTime(), nullable=True))
    op.add_column('contracts', sa.Column('work_approved_by', sa.String(36), nullable=True))
    
    # Add foreign key for work_submitted_by
    op.create_foreign_key('fk_contracts_work_submitted_by', 'contracts', 'users',
                          ['work_submitted_by'], ['id'])
    op.create_foreign_key('fk_contracts_work_approved_by', 'contracts', 'users',
                          ['work_approved_by'], ['id'])


def downgrade() -> None:
    op.drop_constraint('fk_contracts_work_approved_by', 'contracts', type_='foreignkey')
    op.drop_constraint('fk_contracts_work_submitted_by', 'contracts', type_='foreignkey')
    op.drop_column('contracts', 'work_approved_by')
    op.drop_column('contracts', 'work_approved_at')
    op.drop_column('contracts', 'work_submitted_by')
    op.drop_column('contracts', 'work_submitted_at')
    op.drop_column('contracts', 'party_b_agreed_at')
    op.drop_column('contracts', 'party_a_agreed_at')
