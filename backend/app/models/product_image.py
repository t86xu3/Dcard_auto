"""
商品圖片備份模型
"""
from datetime import datetime, timezone, timedelta


def _taipei_now():
    return datetime.now(timezone(timedelta(hours=8)))

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from app.db.database import Base


class ProductImage(Base):
    """商品圖片下載記錄"""

    __tablename__ = "product_images"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True)
    original_url = Column(String(1000), nullable=False)
    local_path = Column(String(500))
    image_type = Column(String(20), default="main")  # main / description
    downloaded_at = Column(DateTime, default=_taipei_now)

    # 關聯
    product = relationship("Product", back_populates="product_images")

    def __repr__(self):
        return f"<ProductImage {self.id}: {self.image_type}>"
