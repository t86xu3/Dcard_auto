"""
公告模型
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey

from app.db.database import Base
from app.utils.timezone import taipei_now


class Announcement(Base):
    """公告資料表"""

    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    content = Column(Text, nullable=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=taipei_now)
    updated_at = Column(DateTime, default=taipei_now, onupdate=taipei_now)

    def __repr__(self):
        return f"<Announcement {self.id}: {self.title}>"
