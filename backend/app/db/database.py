"""
資料庫連線設定
"""
from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

# SQLite 需要 check_same_thread=False，PostgreSQL 不需要
connect_args = {}
engine_kwargs = {}

if settings.DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    engine_kwargs["pool_pre_ping"] = True
else:
    # PostgreSQL + Supabase PgBouncer：讓 PgBouncer 管連線池
    engine_kwargs["poolclass"] = NullPool

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    **engine_kwargs,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """取得資料庫 Session（FastAPI 依賴注入用）"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def get_db_session():
    """取得資料庫 Session（Context Manager，供 Celery 等非 FastAPI 環境使用）"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_tables():
    """建立所有資料表"""
    from app.models import User, Product, ProductImage, Article, ApiUsage, PromptTemplate, UsageRecord  # noqa: F401
    Base.metadata.create_all(bind=engine)
