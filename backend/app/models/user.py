"""
用戶模型
"""
from datetime import datetime, timezone, timedelta

from sqlalchemy import Column, Integer, String, Boolean, DateTime

from app.db.database import Base


def _taipei_now():
    return datetime.now(timezone(timedelta(hours=8)))


class User(Base):
    """用戶資料表"""

    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    hashed_password = Column(String(200), nullable=False)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_taipei_now)

    def __repr__(self):
        return f"<User {self.id}: {self.username}>"
