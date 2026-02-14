"""
API 使用量記錄模型
"""
from datetime import datetime, date

from sqlalchemy import Column, Integer, DateTime, Date

from app.db.database import Base


class ApiUsage(Base):
    """API 使用量記錄（每日統計）"""

    __tablename__ = "api_usage"

    id = Column(Integer, primary_key=True, index=True)
    usage_date = Column(Date, unique=True, index=True, default=date.today)
    requests = Column(Integer, default=0)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<ApiUsage {self.usage_date}: {self.requests} requests>"
