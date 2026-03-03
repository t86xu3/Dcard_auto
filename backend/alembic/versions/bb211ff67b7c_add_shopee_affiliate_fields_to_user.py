"""add shopee affiliate fields to user

Revision ID: bb211ff67b7c
Revises: 373252448fd1
Create Date: 2026-03-03 16:32:49.359804

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bb211ff67b7c'
down_revision: Union[str, Sequence[str], None] = '373252448fd1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.add_column(sa.Column('shopee_affiliate_id', sa.String(length=100), nullable=True))
        batch_op.add_column(sa.Column('default_sub_id', sa.String(length=100), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('users') as batch_op:
        batch_op.drop_column('default_sub_id')
        batch_op.drop_column('shopee_affiliate_id')
