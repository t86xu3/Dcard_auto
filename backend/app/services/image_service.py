"""
圖片下載與管理服務
"""
import logging
import zipfile
from pathlib import Path
from typing import Optional

import httpx

from app.config import settings
from app.models.product_image import ProductImage

logger = logging.getLogger(__name__)


class ImageService:
    """圖片服務"""

    async def download_product_images(self, product, db) -> dict:
        """下載商品圖片到本地"""
        product_dir = settings.IMAGES_DIR / str(product.id)
        product_dir.mkdir(parents=True, exist_ok=True)

        downloaded = 0
        errors = []

        all_images = []
        if product.images:
            all_images.extend([(url, "main") for url in product.images])
        if product.description_images:
            all_images.extend([(url, "description") for url in product.description_images])

        async with httpx.AsyncClient(timeout=30) as client:
            for idx, (url, img_type) in enumerate(all_images):
                try:
                    # 檢查是否已下載
                    existing = db.query(ProductImage).filter(
                        ProductImage.product_id == product.id,
                        ProductImage.original_url == url,
                    ).first()
                    if existing and existing.local_path and Path(existing.local_path).exists():
                        continue

                    # 下載圖片
                    response = await client.get(url)
                    response.raise_for_status()

                    ext = ".jpg"
                    content_type = response.headers.get("content-type", "")
                    if "png" in content_type:
                        ext = ".png"
                    elif "webp" in content_type:
                        ext = ".webp"

                    filename = f"{img_type}_{idx}{ext}"
                    filepath = product_dir / filename

                    filepath.write_bytes(response.content)

                    # 記錄到資料庫
                    if existing:
                        existing.local_path = str(filepath)
                    else:
                        record = ProductImage(
                            product_id=product.id,
                            original_url=url,
                            local_path=str(filepath),
                            image_type=img_type,
                        )
                        db.add(record)

                    downloaded += 1

                except Exception as e:
                    errors.append(f"下載失敗 [{url[:50]}...]: {str(e)}")
                    logger.error(f"圖片下載錯誤: {e}")

        db.commit()

        return {
            "product_id": product.id,
            "downloaded": downloaded,
            "total": len(all_images),
            "errors": errors,
        }

    def get_article_image_list(self, article) -> list:
        """取得文章圖片清單"""
        images = []
        if not article.image_map:
            return images

        for marker, url in article.image_map.items():
            images.append({
                "marker": marker,
                "url": url,
                "local_path": None,  # TODO: 查詢本地路徑
            })

        return images

    async def create_article_images_zip(self, article, db) -> Optional[str]:
        """打包文章圖片為 ZIP"""
        if not article.image_map:
            return None

        zip_path = settings.IMAGES_DIR / f"article_{article.id}_images.zip"

        async with httpx.AsyncClient(timeout=30) as client:
            with zipfile.ZipFile(str(zip_path), "w") as zf:
                for idx, (marker, url) in enumerate(article.image_map.items()):
                    try:
                        # 優先使用本地檔案
                        local_record = db.query(ProductImage).filter(
                            ProductImage.original_url == url
                        ).first()

                        if local_record and local_record.local_path and Path(local_record.local_path).exists():
                            zf.write(local_record.local_path, f"{marker.replace(':', '_')}.jpg")
                        else:
                            response = await client.get(url)
                            response.raise_for_status()
                            zf.writestr(f"{marker.replace(':', '_')}.jpg", response.content)

                    except Exception as e:
                        logger.error(f"打包圖片失敗 [{marker}]: {e}")

        return str(zip_path) if zip_path.exists() else None


# 單例
image_service = ImageService()
