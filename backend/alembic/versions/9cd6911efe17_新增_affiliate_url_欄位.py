"""新增 affiliate_url 欄位

Revision ID: 9cd6911efe17
Revises: e075f9e19c75
Create Date: 2026-02-21 19:51:01.705956

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9cd6911efe17'
down_revision: Union[str, Sequence[str], None] = 'e075f9e19c75'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('products') as batch_op:
        batch_op.add_column(sa.Column('affiliate_url', sa.String(length=1000), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('products') as batch_op:
        batch_op.drop_column('affiliate_url')
