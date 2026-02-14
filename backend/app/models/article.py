"""
文章模型
"""
from datetime import datetime

from sqlalchemy import Column, Integer, String, Text, DateTime, JSON, Float

from app.db.database import Base


class Article(Base):
    """文章資料表"""

    __tablename__ = "articles"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    content = Column(Text)  # 純文字內容
    content_with_images = Column(Text)  # 含圖片標記的內容
    article_type = Column(String(20), default="comparison")  # comparison / review / seo
    target_forum = Column(String(50), default="goodthings")
    product_ids = Column(JSON)  # 關聯的商品 ID 列表
    image_map = Column(JSON)  # 圖片標記對應表 {"IMAGE:pid:idx": "url"}
    seo_score = Column(Float)
    seo_suggestions = Column(JSON)
    status = Column(String(20), default="draft")  # draft / optimized / published
    published_url = Column(String(1000))
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def __repr__(self):
        return f"<Article {self.id}: {self.title[:30]}>"
