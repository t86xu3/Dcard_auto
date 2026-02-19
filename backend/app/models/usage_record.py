"""
API 使用量記錄模型（可擴充多供應商/多模型/多用戶）
"""
from datetime import datetime, date, timezone, timedelta

from sqlalchemy import Column, Integer, String, DateTime, Date, UniqueConstraint


def _taipei_now():
    return datetime.now(timezone(timedelta(hours=8)))


from app.db.database import Base


class UsageRecord(Base):
    """API 使用量記錄（按 provider + model + date + user 聚合）"""

    __tablename__ = "usage_records"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String, nullable=False, index=True)       # "google" / "openai" / "anthropic"
    model = Column(String, nullable=False, index=True)          # "gemini-2.5-flash" / "gemini-2.5-pro"
    user_id = Column(Integer, nullable=True, index=True)        # 未來多用戶時 FK → users
    usage_date = Column(Date, nullable=False, index=True, default=date.today)
    requests = Column(Integer, default=0)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    created_at = Column(DateTime, default=_taipei_now)
    updated_at = Column(DateTime, default=_taipei_now, onupdate=_taipei_now)

    __table_args__ = (
        UniqueConstraint('provider', 'model', 'usage_date', 'user_id', name='uq_usage_record'),
    )

    def __repr__(self):
        return f"<UsageRecord {self.provider}/{self.model} {self.usage_date}: {self.requests} reqs>"
