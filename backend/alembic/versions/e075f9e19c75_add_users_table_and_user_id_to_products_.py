"""add users table and user_id to products articles prompts

Revision ID: e075f9e19c75
Revises: fcb94995788e
Create Date: 2026-02-19 22:39:33.593699

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e075f9e19c75'
down_revision: Union[str, Sequence[str], None] = 'fcb94995788e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. 建立 users 表
    op.create_table('users',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('username', sa.String(length=50), nullable=False),
        sa.Column('email', sa.String(length=200), nullable=False),
        sa.Column('hashed_password', sa.String(length=200), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=True),
        sa.Column('is_admin', sa.Boolean(), nullable=True),
        sa.Column('is_approved', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_users_email'), 'users', ['email'], unique=True)
    op.create_index(op.f('ix_users_id'), 'users', ['id'], unique=False)
    op.create_index(op.f('ix_users_username'), 'users', ['username'], unique=True)

    # 2. 插入管理員帳號（密碼 hash 預先計算）
    op.execute(
        sa.text(
            "INSERT INTO users (username, email, hashed_password, is_active, is_admin, is_approved) "
            "VALUES (:username, :email, :hashed_password, 1, 1, 1)"
        ).bindparams(
            username="t86xu3",
            email="t86xu3@dcard-auto.local",
            hashed_password="$2b$12$L1KTKl2ZPr6WZmq/nCHtmO8ksQE3ixjiSoPspUTcHySLE6//nkQku",
        )
    )

    # 3. articles 加 user_id（SQLite 用 batch mode）
    with op.batch_alter_table('articles') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_articles_user_id', ['user_id'])
        batch_op.create_foreign_key('fk_articles_user_id', 'users', ['user_id'], ['id'])

    # 4. products 加 user_id + 改 unique 約束
    with op.batch_alter_table('products') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.drop_index('ix_products_item_id')
        batch_op.create_index('ix_products_item_id', ['item_id'], unique=False)
        batch_op.create_index('ix_products_user_id', ['user_id'])
        batch_op.create_unique_constraint('uq_product_user_item', ['user_id', 'item_id'])
        batch_op.create_foreign_key('fk_products_user_id', 'users', ['user_id'], ['id'])

    # 5. prompt_templates 加 user_id
    with op.batch_alter_table('prompt_templates') as batch_op:
        batch_op.add_column(sa.Column('user_id', sa.Integer(), nullable=True))
        batch_op.create_index('ix_prompt_templates_user_id', ['user_id'])
        batch_op.create_foreign_key('fk_prompt_templates_user_id', 'users', ['user_id'], ['id'])

    # 6. 既有資料歸 admin（user_id=1）
    op.execute(sa.text("UPDATE products SET user_id = 1 WHERE user_id IS NULL"))
    op.execute(sa.text("UPDATE articles SET user_id = 1 WHERE user_id IS NULL"))


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('prompt_templates') as batch_op:
        batch_op.drop_constraint('fk_prompt_templates_user_id', type_='foreignkey')
        batch_op.drop_index('ix_prompt_templates_user_id')
        batch_op.drop_column('user_id')

    with op.batch_alter_table('products') as batch_op:
        batch_op.drop_constraint('fk_products_user_id', type_='foreignkey')
        batch_op.drop_constraint('uq_product_user_item', type_='unique')
        batch_op.drop_index('ix_products_user_id')
        batch_op.drop_index('ix_products_item_id')
        batch_op.create_index('ix_products_item_id', ['item_id'], unique=True)
        batch_op.drop_column('user_id')

    with op.batch_alter_table('articles') as batch_op:
        batch_op.drop_constraint('fk_articles_user_id', type_='foreignkey')
        batch_op.drop_index('ix_articles_user_id')
        batch_op.drop_column('user_id')

    op.drop_index(op.f('ix_users_username'), table_name='users')
    op.drop_index(op.f('ix_users_id'), table_name='users')
    op.drop_index(op.f('ix_users_email'), table_name='users')
    op.drop_table('users')
