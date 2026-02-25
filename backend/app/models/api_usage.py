"""
API 使用量記錄模型
"""
from sqlalchemy import Column, Integer, DateTime, Date

from app.db.database import Base
from app.utils.timezone import taipei_now, taipei_today


class ApiUsage(Base):
    """API 使用量記錄（每日統計）"""

    __tablename__ = "api_usage"

    id = Column(Integer, primary_key=True, index=True)
    usage_date = Column(Date, unique=True, index=True, default=taipei_today)
    requests = Column(Integer, default=0)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=taipei_now)
    updated_at = Column(DateTime, default=taipei_now, onupdate=taipei_now)

    def __repr__(self):
        return f"<ApiUsage {self.usage_date}: {self.requests} requests>"
