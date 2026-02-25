"""
Prompt 範本模型
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey

from app.db.database import Base
from app.utils.timezone import taipei_now


class PromptTemplate(Base):
    """Prompt 範本資料表"""

    __tablename__ = "prompt_templates"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    is_default = Column(Boolean, default=False)
    is_builtin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=taipei_now)
    updated_at = Column(DateTime, default=taipei_now, onupdate=taipei_now)

    def __repr__(self):
        return f"<PromptTemplate {self.id}: {self.name}>"
