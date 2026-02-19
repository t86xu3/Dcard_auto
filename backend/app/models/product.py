"""
商品資料模型
"""
from datetime import datetime, timezone, timedelta


def _taipei_now():
    return datetime.now(timezone(timedelta(hours=8)))

from sqlalchemy import Column, Integer, String, Float, Text, DateTime, JSON, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship

from app.db.database import Base


class Product(Base):
    """商品資料表"""

    __tablename__ = "products"
    __table_args__ = (
        UniqueConstraint('user_id', 'item_id', name='uq_product_user_item'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    item_id = Column(String(50), index=True, nullable=False)
    shop_id = Column(String(50), index=True)
    name = Column(String(500), nullable=False)
    price = Column(Float)
    original_price = Column(Float)
    discount = Column(String(50))
    description = Column(Text)
    images = Column(JSON)  # 圖片 URL 列表
    description_images = Column(JSON)  # 商品描述圖片 URL 列表
    rating = Column(Float)
    sold = Column(Integer)
    shop_name = Column(String(200))
    product_url = Column(String(1000))
    captured_at = Column(DateTime)
    created_at = Column(DateTime, default=_taipei_now)

    # 關聯
    product_images = relationship("ProductImage", back_populates="product", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Product {self.item_id}: {self.name[:30]}>"
