"""
商品 API 路由
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.product import Product
from app.models.user import User
from app.auth import get_current_user

router = APIRouter()


# Pydantic Schemas
class ProductBase(BaseModel):
    item_id: str
    shop_id: Optional[str] = None
    name: str
    price: Optional[float] = None
    original_price: Optional[float] = None
    discount: Optional[str] = None
    description: Optional[str] = None
    images: Optional[List[str]] = None
    description_images: Optional[List[str]] = None
    rating: Optional[float] = None
    sold: Optional[int] = None
    shop_name: Optional[str] = None
    product_url: Optional[str] = None


class ProductCreate(ProductBase):
    pass


class ProductResponse(ProductBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class BatchDeleteRequest(BaseModel):
    ids: List[int]


class BatchDeleteResponse(BaseModel):
    deleted_count: int
    deleted_ids: List[int]


@router.get("", response_model=List[ProductResponse])
async def list_products(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出當前用戶的商品"""
    products = (
        db.query(Product)
        .filter(Product.user_id == current_user.id)
        .order_by(Product.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return products


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """取得單一商品詳情"""
    product = db.query(Product).filter(Product.id == product_id, Product.user_id == current_user.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")
    return product


@router.post("", response_model=ProductResponse)
async def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """新增商品（Chrome Extension 呼叫）"""
    existing = db.query(Product).filter(
        Product.user_id == current_user.id,
        Product.item_id == product.item_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="商品已存在")

    db_product = Product(**product.model_dump(), user_id=current_user.id)
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product


@router.delete("/{product_id}")
async def delete_product(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """刪除商品"""
    product = db.query(Product).filter(Product.id == product_id, Product.user_id == current_user.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    db.delete(product)
    db.commit()
    return {"message": "商品已刪除"}


@router.post("/batch-delete", response_model=BatchDeleteResponse)
async def batch_delete_products(
    request: BatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量刪除商品（只刪自己的）"""
    deleted_ids = []
    for product_id in request.ids:
        product = db.query(Product).filter(Product.id == product_id, Product.user_id == current_user.id).first()
        if product:
            db.delete(product)
            deleted_ids.append(product_id)

    db.commit()
    return BatchDeleteResponse(deleted_count=len(deleted_ids), deleted_ids=deleted_ids)


@router.post("/{product_id}/download-images")
async def download_product_images(
    product_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """下載商品圖片到本地"""
    from app.config import settings
    if settings.is_production:
        raise HTTPException(
            status_code=501,
            detail="生產環境不支援本地圖片下載，請直接使用蝦皮 CDN URL"
        )

    product = db.query(Product).filter(Product.id == product_id, Product.user_id == current_user.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    from app.services.image_service import image_service
    result = await image_service.download_product_images(product, db)
    return result
