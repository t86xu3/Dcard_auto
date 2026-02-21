"""
商品 API 路由
"""
import re
import logging
from typing import List, Optional
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.product import Product
from app.models.user import User
from app.auth import get_current_user

logger = logging.getLogger(__name__)

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
    affiliate_url: Optional[str] = None


class ProductCreate(ProductBase):
    pass


class ProductResponse(ProductBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ProductUpdateRequest(BaseModel):
    product_url: Optional[str] = None


class BatchDeleteRequest(BaseModel):
    ids: List[int]


class BatchDeleteResponse(BaseModel):
    deleted_count: int
    deleted_ids: List[int]


class AffiliateUrlImportRequest(BaseModel):
    urls: List[str]


class AffiliateImportItem(BaseModel):
    url: str
    item_id: str
    status: str  # "imported" | "updated" | "failed"
    message: Optional[str] = None


class AffiliateImportResult(BaseModel):
    imported: List[AffiliateImportItem]
    skipped: List[AffiliateImportItem]
    failed: List[AffiliateImportItem]


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


@router.post("/import-affiliate-urls", response_model=AffiliateImportResult)
async def import_affiliate_urls(
    request: AffiliateUrlImportRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """從蝦皮聯盟行銷短網址批量匯入商品 placeholder"""
    imported = []
    skipped = []
    failed = []

    async with httpx.AsyncClient(follow_redirects=True, timeout=15.0) as client:
        for url in request.urls:
            url = url.strip()
            if not url:
                continue

            try:
                resp = await client.head(url)
                final_url = str(resp.url)

                # 從最終 URL 路徑提取 shop_id 和 item_id
                # 格式: /{slug}-i.{shop_id}.{item_id}
                match = re.search(r'-i\.(\d+)\.(\d+)', final_url)
                if not match:
                    path_parts = final_url.rstrip('/').split('/')
                    if len(path_parts) >= 3 and path_parts[-1].isdigit() and path_parts[-2].isdigit():
                        shop_id = path_parts[-2]
                        item_id = path_parts[-1]
                    else:
                        failed.append(AffiliateImportItem(
                            url=url, item_id="", status="failed",
                            message=f"無法從 URL 解析 item_id: {final_url}"
                        ))
                        continue
                else:
                    shop_id = match.group(1)
                    item_id = match.group(2)

                existing = db.query(Product).filter(
                    Product.user_id == current_user.id,
                    Product.item_id == item_id,
                ).first()
                if existing:
                    existing.affiliate_url = url
                    db.commit()
                    skipped.append(AffiliateImportItem(
                        url=url, item_id=item_id, status="updated",
                        message="商品已存在，已更新聯盟網址"
                    ))
                    continue

                product = Product(
                    user_id=current_user.id,
                    item_id=item_id,
                    shop_id=shop_id,
                    name="待擷取",
                    product_url=final_url,
                    affiliate_url=url,
                )
                db.add(product)
                db.commit()

                imported.append(AffiliateImportItem(
                    url=url, item_id=item_id, status="imported"
                ))

            except Exception as e:
                logger.error(f"解析聯盟網址失敗: {url} - {e}")
                failed.append(AffiliateImportItem(
                    url=url, item_id="", status="failed",
                    message=str(e)
                ))

    return AffiliateImportResult(imported=imported, skipped=skipped, failed=failed)


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


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    request: ProductUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新商品資訊（目前僅支援 product_url）"""
    product = db.query(Product).filter(Product.id == product_id, Product.user_id == current_user.id).first()
    if not product:
        raise HTTPException(status_code=404, detail="商品不存在")

    if request.product_url is not None:
        product.product_url = request.product_url

    db.commit()
    db.refresh(product)
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
        # Placeholder → 用 Extension 資料填充，保留 affiliate_url
        if existing.affiliate_url and existing.name == "待擷取":
            saved_affiliate = existing.affiliate_url
            for key, value in product.model_dump(exclude_unset=True).items():
                setattr(existing, key, value)
            existing.affiliate_url = saved_affiliate
            db.commit()
            db.refresh(existing)
            return existing
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
    """批量刪除商品（只刪自己的，單次查詢）"""
    products = db.query(Product).filter(
        Product.id.in_(request.ids),
        Product.user_id == current_user.id,
    ).all()
    deleted_ids = [p.id for p in products]
    for p in products:
        db.delete(p)
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
