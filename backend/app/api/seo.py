"""
SEO 分析 API 路由
"""
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class SeoAnalyzeRequest(BaseModel):
    title: str
    content: str
    keywords: Optional[list] = None


@router.post("/analyze")
async def analyze_seo(request: SeoAnalyzeRequest):
    """分析文章 SEO 分數"""
    from app.services.seo_service import seo_service

    result = seo_service.analyze(
        title=request.title,
        content=request.content,
        keywords=request.keywords,
    )
    return result
