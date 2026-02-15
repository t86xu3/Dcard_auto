"""
Prompt 範本模型
"""
from datetime import datetime

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
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<PromptTemplate {self.id}: {self.name}>"
