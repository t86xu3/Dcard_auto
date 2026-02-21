"""
文章 API 路由
"""
import threading
import logging
import traceback
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
import httpx

from app.db.database import get_db, get_db_session
from app.models.article import Article
from app.models.user import User
from app.auth import get_current_user, get_approved_user

logger = logging.getLogger(__name__)

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
    sub_id: Optional[str] = None  # 蝦皮聯盟行銷追蹤 Sub_id


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
    sub_id: Optional[str] = None
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


def _generate_article_background(
    article_id: int,
    product_ids: List[int],
    article_type: str,
    target_forum: str,
    prompt_template_id: Optional[int],
    model: Optional[str],
    user_id: int,
    include_images: bool,
    image_sources: List[str],
):
    """背景執行緒：實際執行 LLM 文章生成"""
    import time as _time
    from app.services.llm_service import llm_service
    from app.services.seo_service import seo_service
    from app.models.product import Product

    use_model = model or "gemini-2.5-flash"
    start_time = _time.time()

    with get_db_session() as db:
        try:
            # 查詢後按 product_ids 順序重排（SQL IN 不保序）
            products_map = {p.id: p for p in db.query(Product).filter(
                Product.id.in_(product_ids),
                Product.user_id == user_id,
            ).all()}
            products = [products_map[pid] for pid in product_ids if pid in products_map]

            result = llm_service.generate_article(
                products=products,
                db=db,
                article_type=article_type,
                target_forum=target_forum,
                prompt_template_id=prompt_template_id,
                model=model,
                user_id=user_id,
                include_images=include_images,
                image_sources=image_sources,
            )

            # 自動 SEO 分析
            seo_result = seo_service.analyze(title=result["title"], content=result["content"])

            # 更新 placeholder 文章
            article = db.query(Article).filter(Article.id == article_id).first()
            if article:
                article.title = result["title"]
                article.content = result["content"]
                article.content_with_images = result["content_with_images"]
                article.image_map = result.get("image_map")
                article.seo_score = seo_result["score"]
                article.seo_suggestions = seo_result
                article.status = "draft"
                db.commit()
                elapsed = round(_time.time() - start_time, 1)
                logger.info(f"文章 {article_id} 生成完成（{elapsed}s, model={use_model}）")
        except Exception as e:
            elapsed = round(_time.time() - start_time, 1)
            logger.error(f"文章 {article_id} 生成失敗（{elapsed}s）: {e}")

            # 組裝詳細錯誤報告
            product_names = []
            try:
                for pid in product_ids:
                    p = products_map.get(pid)
                    product_names.append(f"  - [{pid}] {p.name[:40] if p else '(查無商品)'}")
            except Exception:
                product_names = [f"  - IDs: {product_ids}"]

            retry_info = ""
            if hasattr(e, "__cause__") and hasattr(e.__cause__, "retry_history"):
                retry_info = "\n".join(f"  {r}" for r in e.__cause__.retry_history)
            elif hasattr(e, "retry_history"):
                retry_info = "\n".join(f"  {r}" for r in e.retry_history)

            # 完整 traceback
            tb = traceback.format_exc()

            error_report = (
                f"[錯誤報告]\n"
                f"錯誤類型: {type(e).__name__}\n"
                f"錯誤訊息: {str(e)}\n"
                f"\n"
                f"[請求參數]\n"
                f"模型: {use_model}\n"
                f"文章類型: {article_type}\n"
                f"目標看板: {target_forum}\n"
                f"附圖模式: {'是' if include_images else '否'}\n"
                f"圖片來源: {image_sources}\n"
                f"範本 ID: {prompt_template_id or '預設'}\n"
                f"耗時: {elapsed}s\n"
                f"\n"
                f"[商品列表] ({len(product_ids)} 件)\n"
                f"{chr(10).join(product_names)}\n"
            )
            if retry_info:
                error_report += f"\n[重試紀錄]\n{retry_info}\n"
            error_report += f"\n[完整 Traceback]\n{tb}"

            article = db.query(Article).filter(Article.id == article_id).first()
            if article:
                article.status = "failed"
                article.title = f"生成失敗：{str(e)[:100]}"
                article.content = error_report
                db.commit()


@router.post("/generate", response_model=ArticleResponse)
async def generate_article(
    request: ArticleGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_approved_user),
):
    """生成文章（需已核准用戶）— 非同步：立即回傳 placeholder，背景生成"""
    from app.models.product import Product

    # 驗證 product_ids 屬於當前用戶（查詢後按前端順序重排）
    products_map = {p.id: p for p in db.query(Product).filter(
        Product.id.in_(request.product_ids),
        Product.user_id == current_user.id,
    ).all()}
    if not products_map:
        raise HTTPException(status_code=404, detail="找不到指定的商品")
    if len(products_map) != len(request.product_ids):
        raise HTTPException(status_code=403, detail="部分商品不屬於你")
    products = [products_map[pid] for pid in request.product_ids if pid in products_map]

    # 建立 placeholder 文章
    article = Article(
        title="文章生成中...",
        content=None,
        content_with_images=None,
        article_type=request.article_type,
        target_forum=request.target_forum,
        product_ids=request.product_ids,
        sub_id=request.sub_id.strip() if request.sub_id and request.sub_id.strip() else None,
        status="generating",
        user_id=current_user.id,
    )
    db.add(article)
    db.commit()
    db.refresh(article)

    # 啟動背景執行緒
    thread = threading.Thread(
        target=_generate_article_background,
        args=(
            article.id,
            request.product_ids,
            request.article_type,
            request.target_forum,
            request.prompt_template_id,
            request.model,
            current_user.id,
            request.include_images,
            request.image_sources,
        ),
        daemon=True,
    )
    thread.start()

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

    # content 更新時同步重新生成 content_with_images
    if "content" in update_data and article.image_map:
        content_with_images = article.content
        for marker, img_url in article.image_map.items():
            content_with_images = content_with_images.replace(
                f"{{{{{marker}}}}}",
                f"\n\n![商品圖片]({img_url})\n\n"
            )
        article.content_with_images = content_with_images

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


class BatchDeleteRequest(BaseModel):
    ids: List[int]


@router.post("/batch-delete")
async def batch_delete_articles(
    request: BatchDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """批量刪除文章（只刪自己的）"""
    articles = db.query(Article).filter(
        Article.id.in_(request.ids),
        Article.user_id == current_user.id,
    ).all()
    deleted_ids = [a.id for a in articles]
    for a in articles:
        db.delete(a)
    db.commit()
    return {"deleted_count": len(deleted_ids), "deleted_ids": deleted_ids}


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
    optimized_title = result.get("optimized_title", article.title)
    optimized_content = result.get("optimized_content", article.content)
    article.title = optimized_title
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
