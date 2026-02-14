"""
資料庫連線設定
"""
from contextlib import contextmanager

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from app.config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False}  # SQLite 專用
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
    from app.models import Product, ProductImage, Article, ApiUsage  # noqa: F401
    Base.metadata.create_all(bind=engine)
