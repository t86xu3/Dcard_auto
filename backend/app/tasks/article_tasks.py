"""
文章生成 Celery 任務
"""
import logging

logger = logging.getLogger(__name__)

try:
    from app.celery_app import celery_app

    @celery_app.task(bind=True, max_retries=2)
    def generate_article_task(self, product_ids: list, article_type: str, target_forum: str):
        """非同步生成文章"""
        from app.db.database import get_db_session
        from app.models.product import Product
        from app.models.article import Article
        from app.services.llm_service import llm_service

        with get_db_session() as db:
            products = db.query(Product).filter(Product.id.in_(product_ids)).all()
            if not products:
                return {"error": "找不到指定的商品"}

            result = llm_service.generate_article(
                products=products,
                article_type=article_type,
                target_forum=target_forum,
            )

            article = Article(
                title=result["title"],
                content=result["content"],
                content_with_images=result["content_with_images"],
                article_type=article_type,
                target_forum=target_forum,
                product_ids=product_ids,
                image_map=result.get("image_map"),
                status="draft",
            )
            db.add(article)
            db.commit()
            db.refresh(article)

            return {"article_id": article.id, "title": article.title}

except Exception:
    logger.warning("Celery 未啟動，文章生成將使用同步模式")
