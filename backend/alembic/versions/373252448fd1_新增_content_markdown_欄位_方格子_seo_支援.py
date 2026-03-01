"""新增 content_markdown 欄位（方格子 SEO 支援）

Revision ID: 373252448fd1
Revises: b2c3d4e5f6a7
Create Date: 2026-03-01 18:53:17.318064

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '373252448fd1'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('articles') as batch_op:
        batch_op.add_column(sa.Column('content_markdown', sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('articles') as batch_op:
        batch_op.drop_column('content_markdown')
