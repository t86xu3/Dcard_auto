"""
關鍵字研究 API 路由
"""
import asyncio
import logging
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.models.product import Product
from app.auth import get_approved_user

logger = logging.getLogger(__name__)

router = APIRouter()


class KeywordResearchRequest(BaseModel):
    product_ids: List[int]


@router.post("/research")
async def research_keywords(
    request: KeywordResearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_approved_user),
):
    """完整關鍵字研究（需已核准用戶）

    從選定商品提取種子詞 → Autocomplete 展開 → LLM 策略生成
    """
    from app.services.keyword_research_service import keyword_research_service

    # 驗證 product_ids 屬於當前用戶
    products = db.query(Product).filter(
        Product.id.in_(request.product_ids),
        Product.user_id == current_user.id,
    ).all()

    if not products:
        raise HTTPException(status_code=404, detail="找不到指定的商品")

    # 過濾掉 placeholder（未擷取）商品
    valid_products = [p for p in products if p.name and p.name != "待擷取"]
    if not valid_products:
        raise HTTPException(status_code=400, detail="所有商品尚未擷取，無法研究關鍵字")

    try:
        strategy = await asyncio.to_thread(
            keyword_research_service.research_keywords,
            valid_products,
            current_user.id,
        )
        return strategy
    except Exception as e:
        logger.error(f"關鍵字研究失敗: {e}")
        raise HTTPException(status_code=500, detail=f"關鍵字研究失敗: {str(e)}")


@router.get("/autocomplete")
async def autocomplete_preview(
    seed: str = Query(..., min_length=1, description="種子關鍵字"),
    current_user: User = Depends(get_approved_user),
):
    """Autocomplete 預覽（需已核准用戶）"""
    from app.services.keyword_research_service import keyword_research_service

    try:
        suggestions = await asyncio.to_thread(
            keyword_research_service.autocomplete_preview,
            seed,
        )
        return {"seed": seed, "suggestions": suggestions}
    except Exception as e:
        logger.error(f"Autocomplete 預覽失敗: {e}")
        raise HTTPException(status_code=500, detail=f"Autocomplete 失敗: {str(e)}")
