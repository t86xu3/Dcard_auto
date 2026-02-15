"""
Prompt 範本模型
"""
from datetime import datetime, timezone, timedelta


def _taipei_now():
    return datetime.now(timezone(timedelta(hours=8)))

from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime

from app.db.database import Base


class PromptTemplate(Base):
    """Prompt 範本資料表"""

    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    is_default = Column(Boolean, default=False)
    is_builtin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=_taipei_now)
    updated_at = Column(DateTime, default=_taipei_now, onupdate=_taipei_now)

    def __repr__(self):
        return f"<PromptTemplate {self.id}: {self.name}>"
