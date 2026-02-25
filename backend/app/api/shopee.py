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


@router.get("/explore")
def explore_products(
    keyword: str = Query(None),
    sort_type: int = Query(2, ge=1, le=5),
    list_type: int = Query(0, ge=0, le=2),
    is_ams_offer: bool = Query(None),
    is_key_seller: bool = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=50),
    min_commission_rate: float = Query(None, ge=0),
    min_sales: int = Query(None, ge=0),
    max_sales: int = Query(None, ge=0),
    min_price: float = Query(None, ge=0),
    max_price: float = Query(None, ge=0),
    min_rating: float = Query(None, ge=0, le=5),
    current_user: User = Depends(get_current_user),
):
    """商品探索（彈性查詢 + 後端過濾）"""
    return shopee_service.explore_products(
        keyword=keyword,
        sort_type=sort_type,
        list_type=list_type,
        is_ams_offer=is_ams_offer,
        is_key_seller=is_key_seller,
        page=page,
        limit=limit,
        min_commission_rate=min_commission_rate,
        min_sales=min_sales,
        max_sales=max_sales,
        min_price=min_price,
        max_price=max_price,
        min_rating=min_rating,
    )
