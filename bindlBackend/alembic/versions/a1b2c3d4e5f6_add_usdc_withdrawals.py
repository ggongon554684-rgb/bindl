"""Add USDC fields to reputation and withdrawals table

Revision ID: a1b2c3d4e5f6_add_usdc_withdrawals
Revises:
Create Date: 2026-03-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6_add_usdc_withdrawals'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # USDC fields on existing reputation table
    op.add_column("reputation", sa.Column("usdc_earned",  sa.Float(), nullable=True, server_default="0"))
    op.add_column("reputation", sa.Column("usdc_spent",   sa.Float(), nullable=True, server_default="0"))
    op.add_column("reputation", sa.Column("usdc_balance", sa.Float(), nullable=True, server_default="0"))

    # New withdrawals table
    op.create_table(
        "withdrawals",
        sa.Column("id",               sa.String(36),  primary_key=True),
        sa.Column("user_id",          sa.String(36),  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount_usdc",      sa.Float(),     nullable=False),
        sa.Column("amount_php",       sa.Float(),     nullable=True),
        sa.Column("exchange_rate",    sa.Float(),     nullable=True),
        sa.Column("fee_usdc",         sa.Float(),     server_default="0"),
        sa.Column("channel",          sa.String(20),  nullable=False),
        sa.Column("recipient_handle", sa.String(255), nullable=False),
        sa.Column("status",           sa.String(20),  server_default="pending"),
        sa.Column("external_id",      sa.String(255), nullable=True),
        sa.Column("failure_reason",   sa.Text(),      nullable=True),
        sa.Column("created_at",       sa.DateTime(),  nullable=True),
        sa.Column("updated_at",       sa.DateTime(),  nullable=True),
        sa.Column("completed_at",     sa.DateTime(),  nullable=True),
    )


def downgrade() -> None:
    op.drop_table("withdrawals")
    op.drop_column("reputation", "usdc_balance")
    op.drop_column("reputation", "usdc_spent")
    op.drop_column("reputation", "usdc_earned")
