"""
蝦皮聯盟行銷 API 端點
"""
from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user
from app.models.user import User
from app.services.shopee_service import shopee_service

router = APIRouter()


@router.get("/offers")
def get_shopee_offers(
    limit: int = Query(5, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """平台促銷活動"""
    return shopee_service.get_shopee_offers(limit=limit)


@router.get("/shop-offers")
def get_shop_offers(
    limit: int = Query(5, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """商店佣金優惠"""
    return shopee_service.get_shop_offers(limit=limit)


@router.get("/product-offers")
def get_product_offers(
    limit: int = Query(5, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    """高佣金商品"""
    return shopee_service.get_product_offers(limit=limit)
