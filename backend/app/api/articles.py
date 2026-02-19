"""
文章 API 路由
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx

from app.db.database import get_db
from app.models.article import Article
from app.models.user import User
from app.auth import get_current_user, get_approved_user

router = APIRouter()


# Pydantic Schemas
class ArticleGenerateRequest(BaseModel):
    product_ids: List[int]
    article_type: str = "comparison"  # comparison / review / seo
    target_forum: str = "goodthings"
    prompt_template_id: Optional[int] = None
    model: Optional[str] = None  # "gemini-2.5-flash" / "gemini-2.5-pro"
    include_images: bool = False  # 是否附圖給 LLM 分析
    image_sources: List[str] = ["description"]  # "main" / "description" / 兩者


class ArticleUpdateRequest(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    target_forum: Optional[str] = None
    status: Optional[str] = None


class ArticleResponse(BaseModel):
    id: int
    title: str
    content: Optional[str] = None
    content_with_images: Optional[str] = None
    article_type: str
    target_forum: str
    product_ids: Optional[List[int]] = None
    image_map: Optional[dict] = None
    seo_score: Optional[float] = None
    seo_suggestions: Optional[dict | list] = None
    status: str
    published_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("/image-proxy")
async def image_proxy(url: str = Query(..., description="圖片 URL")):
    """代理下載外部圖片（解決跨域問題，供前端複製圖片到剪貼簿）"""
    if not url.startswith("https://"):
        raise HTTPException(status_code=400, detail="僅支援 HTTPS URL")

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"圖片下載失敗: {e}")

    content_type = resp.headers.get("content-type", "image/jpeg")
    return Response(content=resp.content, media_type=content_type)


@router.post("/generate", response_model=ArticleResponse)
async def generate_article(
    request: ArticleGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_approved_user),
):
    """生成文章（需已核准用戶）"""
    from app.services.llm_service import llm_service
    from app.models.product import Product

    # 驗證 product_ids 屬於當前用戶
    products = db.query(Product).filter(
        Product.id.in_(request.product_ids),
        Product.user_id == current_user.id,
    ).all()
    if not products:
        raise HTTPException(status_code=404, detail="找不到指定的商品")
    if len(products) != len(request.product_ids):
        raise HTTPException(status_code=403, detail="部分商品不屬於你")

    # 生成文章
    result = llm_service.generate_article(
        products=products,
        db=db,
        article_type=request.article_type,
        target_forum=request.target_forum,
        prompt_template_id=request.prompt_template_id,
        model=request.model,
        user_id=current_user.id,
        include_images=request.include_images,
        image_sources=request.image_sources,
    )

    # 自動 SEO 分析（純 Python 計算，不消耗 API quota）
    from app.services.seo_service import seo_service
    seo_result = seo_service.analyze(title=result["title"], content=result["content"])

    # 儲存到資料庫
    article = Article(
        title=result["title"],
        content=result["content"],
        content_with_images=result["content_with_images"],
        article_type=request.article_type,
        target_forum=request.target_forum,
        product_ids=request.product_ids,
        image_map=result.get("image_map"),
        seo_score=seo_result["score"],
        seo_suggestions=seo_result,
        status="draft",
        user_id=current_user.id,
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@router.get("", response_model=List[ArticleResponse])
async def list_articles(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出當前用戶的文章"""
    articles = (
        db.query(Article)
        .filter(Article.user_id == current_user.id)
        .order_by(Article.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    return articles


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """取得單篇文章"""
    article = db.query(Article).filter(Article.id == article_id, Article.user_id == current_user.id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")
    return article


@router.put("/{article_id}", response_model=ArticleResponse)
async def update_article(
    article_id: int,
    request: ArticleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新文章"""
    article = db.query(Article).filter(Article.id == article_id, Article.user_id == current_user.id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(article, key, value)

    db.commit()
    db.refresh(article)
    return article


@router.delete("/{article_id}")
async def delete_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """刪除文章"""
    article = db.query(Article).filter(Article.id == article_id, Article.user_id == current_user.id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    db.delete(article)
    db.commit()
    return {"message": "文章已刪除"}


@router.post("/{article_id}/optimize-seo")
async def optimize_seo(
    article_id: int,
    model: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_approved_user),
):
    """SEO 優化文章（需已核准用戶）"""
    article = db.query(Article).filter(Article.id == article_id, Article.user_id == current_user.id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    from app.services.seo_service import seo_service

    result = seo_service.optimize_with_llm(article, model=model, user_id=current_user.id)
    optimized_content = result.get("optimized_content", article.content)
    article.content = optimized_content

    # 同步更新 content_with_images：重新替換圖片標記
    content_with_images = optimized_content
    if article.image_map:
        for marker, img_url in article.image_map.items():
            content_with_images = content_with_images.replace(
                f"{{{{{marker}}}}}",
                f"\n\n![商品圖片]({img_url})\n\n"
            )
    article.content_with_images = content_with_images

    article.seo_score = result.get("score")
    # 儲存完整分析結果（含 breakdown）
    after_analysis = result.get("after_analysis", {})
    article.seo_suggestions = after_analysis if after_analysis else result.get("suggestions")
    article.status = "optimized"

    db.commit()
    db.refresh(article)

    return {
        "article": ArticleResponse.model_validate(article),
        "before_score": result.get("before_score"),
        "after_score": result.get("score"),
        "before_analysis": result.get("before_analysis"),
        "after_analysis": after_analysis,
    }


@router.get("/{article_id}/copy")
async def copy_article(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """取得 Dcard 格式化內容（供複製貼上）"""
    article = db.query(Article).filter(Article.id == article_id, Article.user_id == current_user.id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    # 將圖片標記替換為位置提示
    content = article.content_with_images or article.content or ""
    image_positions = []

    if article.image_map:
        for marker, url in article.image_map.items():
            placeholder = f"\n\n📷 [在此插入圖片: {marker}]\n\n"
            content = content.replace(f"{{{{{marker}}}}}", placeholder)
            image_positions.append({"marker": marker, "url": url})

    return {
        "title": article.title,
        "content": content,
        "forum": article.target_forum,
        "image_positions": image_positions,
    }


@router.get("/{article_id}/images")
async def get_article_images(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """取得文章圖片清單"""
    article = db.query(Article).filter(Article.id == article_id, Article.user_id == current_user.id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    from app.services.image_service import image_service
    images = image_service.get_article_image_list(article)
    return {"article_id": article_id, "images": images}


@router.get("/{article_id}/images/download")
async def download_article_images(
    article_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """打包下載文章圖片 ZIP"""
    article = db.query(Article).filter(Article.id == article_id, Article.user_id == current_user.id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    from app.services.image_service import image_service
    from fastapi.responses import FileResponse

    zip_path = await image_service.create_article_images_zip(article, db)
    if not zip_path:
        raise HTTPException(status_code=404, detail="沒有可下載的圖片")

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"article_{article_id}_images.zip",
    )
