"""
文章 API 路由
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.article import Article

router = APIRouter()


# Pydantic Schemas
class ArticleGenerateRequest(BaseModel):
    product_ids: List[int]
    article_type: str = "comparison"  # comparison / review / seo
    target_forum: str = "goodthings"
    prompt_template_id: Optional[int] = None


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
    seo_suggestions: Optional[dict] = None
    status: str
    published_url: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.post("/generate", response_model=ArticleResponse)
async def generate_article(request: ArticleGenerateRequest, db: Session = Depends(get_db)):
    """生成文章"""
    from app.services.llm_service import llm_service
    from app.models.product import Product

    # 取得商品資料
    products = db.query(Product).filter(Product.id.in_(request.product_ids)).all()
    if not products:
        raise HTTPException(status_code=404, detail="找不到指定的商品")

    # 生成文章
    result = llm_service.generate_article(
        products=products,
        db=db,
        article_type=request.article_type,
        target_forum=request.target_forum,
        prompt_template_id=request.prompt_template_id,
    )

    # 儲存到資料庫
    article = Article(
        title=result["title"],
        content=result["content"],
        content_with_images=result["content_with_images"],
        article_type=request.article_type,
        target_forum=request.target_forum,
        product_ids=request.product_ids,
        image_map=result.get("image_map"),
        status="draft",
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return article


@router.get("", response_model=List[ArticleResponse])
async def list_articles(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db)
):
    """列出所有文章"""
    articles = db.query(Article).order_by(Article.created_at.desc()).offset(skip).limit(limit).all()
    return articles


@router.get("/{article_id}", response_model=ArticleResponse)
async def get_article(article_id: int, db: Session = Depends(get_db)):
    """取得單篇文章"""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")
    return article


@router.put("/{article_id}", response_model=ArticleResponse)
async def update_article(article_id: int, request: ArticleUpdateRequest, db: Session = Depends(get_db)):
    """更新文章"""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(article, key, value)

    db.commit()
    db.refresh(article)
    return article


@router.delete("/{article_id}")
async def delete_article(article_id: int, db: Session = Depends(get_db)):
    """刪除文章"""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    db.delete(article)
    db.commit()
    return {"message": "文章已刪除"}


@router.post("/{article_id}/optimize-seo", response_model=ArticleResponse)
async def optimize_seo(article_id: int, db: Session = Depends(get_db)):
    """SEO 優化文章"""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    from app.services.seo_service import seo_service

    result = seo_service.optimize_with_llm(article)
    article.content = result.get("optimized_content", article.content)
    article.seo_score = result.get("score")
    article.seo_suggestions = result.get("suggestions")
    article.status = "optimized"

    db.commit()
    db.refresh(article)
    return article


@router.get("/{article_id}/copy")
async def copy_article(article_id: int, db: Session = Depends(get_db)):
    """取得 Dcard 格式化內容（供複製貼上）"""
    article = db.query(Article).filter(Article.id == article_id).first()
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
async def get_article_images(article_id: int, db: Session = Depends(get_db)):
    """取得文章圖片清單"""
    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="文章不存在")

    from app.services.image_service import image_service
    images = image_service.get_article_image_list(article)
    return {"article_id": article_id, "images": images}


@router.get("/{article_id}/images/download")
async def download_article_images(article_id: int, db: Session = Depends(get_db)):
    """打包下載文章圖片 ZIP"""
    article = db.query(Article).filter(Article.id == article_id).first()
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
