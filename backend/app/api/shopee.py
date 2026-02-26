"""
蝦皮聯盟行銷 API 端點
"""
from fastapi import APIRouter, Depends, Query

from app.auth import get_current_user, get_approved_user
from app.models.user import User
from app.services.shopee_service import (
    shopee_service,
    extract_search_keywords,
    calculate_competitor_score,
)

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


@router.get("/find-competitors")
def find_competitors(
    product_name: str = Query(..., min_length=2, max_length=200),
    price: float = Query(None, ge=0),
    current_user: User = Depends(get_approved_user),
):
    """找出商品的 Top 10 競品"""
    # 1. LLM 提取關鍵字
    keywords = extract_search_keywords(product_name, user_id=current_user.id)

    # 2. 每個關鍵字搜尋（按相關度排序）
    seen_ids = set()
    all_items = []
    for kw in keywords:
        result = shopee_service.explore_products(keyword=kw, sort_type=1, limit=50)
        for item in result.get("items", []):
            item_id = item.get("itemId")
            if item_id and item_id not in seen_ids:
                seen_ids.add(item_id)
                all_items.append(item)

    # 3. 計算競品分數並排序
    for item in all_items:
        item["_competitorScore"] = calculate_competitor_score(item, source_price=price)

    all_items.sort(key=lambda x: x["_competitorScore"], reverse=True)
    top_items = all_items[:10]

    return {
        "keywords": keywords,
        "items": top_items,
        "total_candidates": len(all_items),
    }


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
