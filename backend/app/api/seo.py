"""
SEO 分析 API 路由
"""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.article import Article
from app.models.user import User
from app.auth import get_current_user

router = APIRouter()


class SeoAnalyzeRequest(BaseModel):
    title: str
    content: str
    keywords: Optional[list] = None


@router.post("/analyze")
async def analyze_seo(
    request: SeoAnalyzeRequest,
    current_user: User = Depends(get_current_user),
):
    """分析文章 SEO 分數"""
    from app.services.seo_service import seo_service

    result = seo_service.analyze(
        title=request.title,
        content=request.content,
        keywords=request.keywords,
    )
    return result


@router.post("/analyze/{article_id}")
async def analyze_seo_by_id(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """分析指定文章的 SEO 並寫入 DB"""
    article = db.query(Article).filter(Article.id == article_id, Article.user_id == current_user.id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    from app.services.seo_service import seo_service

    result = seo_service.analyze(
        title=article.title,
        content=article.content or "",
    )

    article.seo_score = result["score"]
    article.seo_suggestions = result
    db.commit()
    db.refresh(article)

    return result
