"""
LLM 文章生成服務 - 支援 Gemini + Anthropic Claude（含多模態圖片輸入）
"""
import base64
import logging
import re
from typing import Optional

import httpx
from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from app.config import settings
from app.services.prompts import get_default_prompt, DEFAULT_SYSTEM_PROMPT, SYSTEM_INSTRUCTIONS
from app.models.prompt_template import PromptTemplate
from app.services.gemini_utils import strip_markdown, track_gemini_usage, track_anthropic_usage, is_anthropic_model

logger = logging.getLogger(__name__)


class LLMService:
    """LLM 文章生成服務（Gemini + Claude）"""

    def __init__(self):
        self._gemini_client = None
        self._anthropic_client = None

    @property
    def gemini_client(self):
        if self._gemini_client is None:
            if not settings.GOOGLE_API_KEY:
                raise ValueError("GOOGLE_API_KEY 未設定，請在 .env 中設定")
            self._gemini_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        return self._gemini_client

    @property
    def anthropic_client(self):
        if self._anthropic_client is None:
            if not settings.ANTHROPIC_API_KEY:
                raise ValueError("ANTHROPIC_API_KEY 未設定，請在 .env 中設定")
            import anthropic
            self._anthropic_client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        return self._anthropic_client

    def _download_images(self, products, image_sources: list[str]) -> list[tuple[bytes, str]]:
        """下載商品圖片供 LLM 多模態分析

        Args:
            products: 商品列表
            image_sources: ["main", "description"] 指定要下載哪類圖片

        Returns:
            list of (image_bytes, mime_type)
        """
        image_urls = []
        for p in products:
            if "main" in image_sources and p.images:
                for url in p.images[:3]:
                    image_urls.append(url)
            if "description" in image_sources and p.description_images:
                for url in p.description_images[:5]:
                    image_urls.append(url)

        image_parts = []
        with httpx.Client(timeout=10.0) as client:
            for url in image_urls:
                try:
                    resp = client.get(url)
                    resp.raise_for_status()
                    content_type = resp.headers.get("content-type", "image/jpeg")
                    mime_type = content_type.split(";")[0].strip()
                    if not mime_type.startswith("image/"):
                        mime_type = "image/jpeg"
                    image_parts.append((resp.content, mime_type))
                    logger.debug(f"圖片下載成功: {url[:80]}...")
                except Exception as e:
                    logger.warning(f"圖片下載失敗（跳過）: {url[:80]}... - {e}")

        logger.info(f"共下載 {len(image_parts)}/{len(image_urls)} 張圖片供 LLM 分析")
        return image_parts

    def _call_gemini(self, use_model: str, system_prompt: str, user_message: str, image_parts: list[tuple[bytes, str]] | None = None) -> tuple:
        """呼叫 Gemini API，回傳 (generated_text, response)"""
        contents = [user_message]
        if image_parts:
            for img_bytes, mime_type in image_parts:
                contents.append(types.Part.from_bytes(data=img_bytes, mime_type=mime_type))

        response = self.gemini_client.models.generate_content(
            model=use_model,
            contents=contents,
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=settings.LLM_TEMPERATURE,
                max_output_tokens=settings.LLM_MAX_TOKENS,
            ),
        )
        return response.text, response

    def _call_anthropic(self, use_model: str, system_prompt: str, user_message: str, image_parts: list[tuple[bytes, str]] | None = None) -> tuple:
        """呼叫 Anthropic Claude API，回傳 (generated_text, response)"""
        content = [{"type": "text", "text": user_message}]
        if image_parts:
            for img_bytes, mime_type in image_parts:
                content.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": base64.b64encode(img_bytes).decode("utf-8"),
                    },
                })

        response = self.anthropic_client.messages.create(
            model=use_model,
            max_tokens=settings.LLM_MAX_TOKENS,
            system=system_prompt,
            messages=[{"role": "user", "content": content}],
        )
        generated_text = response.content[0].text
        return generated_text, response

    def generate_article(self, products, db: Session, article_type: str = "comparison", target_forum: str = "goodthings", prompt_template_id: Optional[int] = None, model: Optional[str] = None, user_id: Optional[int] = None, include_images: bool = False, image_sources: list[str] | None = None) -> dict:
        """生成文章"""
        product_ids = [p.id for p in products]

        # 準備商品資訊
        products_info = self._format_products_info(products)

        # 載入 system prompt（從 DB 或預設）
        if prompt_template_id:
            template = db.query(PromptTemplate).filter(PromptTemplate.id == prompt_template_id).first()
            system_prompt = template.content if template else get_default_prompt(db)
        else:
            system_prompt = get_default_prompt(db)

        # 組合使用者訊息（商品資料）
        user_message = f"目標看板：{target_forum}\n\n以下是商品資料，請根據這些資訊撰寫文章：\n\n{products_info}"

        # 組合系統指示（程式碼層級）+ 使用者範本
        full_system_prompt = f"{SYSTEM_INSTRUCTIONS}\n\n---\n\n以下是使用者的寫作風格範本：\n\n{system_prompt}"

        # 下載圖片供 LLM 多模態分析
        image_parts = None
        if include_images:
            sources = image_sources or ["description"]
            image_parts = self._download_images(products, sources)
            if image_parts:
                user_message += "\n\n（以下附有商品圖片，請仔細閱讀圖片中的文字資訊，融入文章內容）"
            else:
                logger.warning("所有圖片下載失敗，將以純文字模式生成")

        use_model = model or settings.LLM_MODEL
        try:
            if is_anthropic_model(use_model):
                generated_text, response = self._call_anthropic(use_model, full_system_prompt, user_message, image_parts=image_parts)
                logger.info(f"Claude API 回應成功，文字長度: {len(generated_text)}")
                track_anthropic_usage(response, model=use_model, user_id=user_id)
            else:
                generated_text, response = self._call_gemini(use_model, full_system_prompt, user_message, image_parts=image_parts)
                logger.info(f"Gemini API 回應成功，文字長度: {len(generated_text)}")
                track_gemini_usage(response, model=use_model, user_id=user_id)

        except Exception as e:
            logger.error(f"LLM API 呼叫失敗 ({use_model}): {e}")
            raise RuntimeError(f"文章生成失敗: {e}")

        # 清除 Markdown 語法（Dcard 不支援）
        generated_text = strip_markdown(generated_text)

        # 解析標題和內容
        title, content = self._parse_title_content(generated_text, products, article_type)

        # 建立圖片標記對應，並在 content_with_images 中嵌入實際圖片
        image_map = {}
        content_with_images = content
        for p in products:
            if p.images:
                for idx, img_url in enumerate(p.images[:3]):
                    marker = f"IMAGE:{p.id}:{idx}"
                    image_map[marker] = img_url
                    # 替換標記為 markdown 圖片語法
                    content_with_images = content_with_images.replace(
                        f"{{{{{marker}}}}}",
                        f"\n\n![商品圖片]({img_url})\n\n"
                    )

        return {
            "title": title,
            "content": content,
            "content_with_images": content_with_images,
            "image_map": image_map,
        }

    def _format_products_info(self, products) -> str:
        """格式化商品資訊供 prompt 使用"""
        info_parts = []
        for i, p in enumerate(products):
            price_str = f"NT${p.price:,.0f}" if p.price else "價格未知"
            original_price_str = f"NT${p.original_price:,.0f}" if p.original_price else ""
            info = f"""---
商品 {i+1}:
- 商品 ID: {p.id}
- 名稱: {p.name}
- 價格: {price_str}
- 原價: {original_price_str or '無折扣'}
- 折扣: {p.discount or '無'}
- 評分: {p.rating or 'N/A'} / 5.0
- 銷量: {p.sold or 'N/A'}
- 店家: {p.shop_name or '未知'}
- 商品連結: {p.product_url or '無'}
- 商品描述: {(p.description or '')[:500]}
- 可用圖片標記: {', '.join([f'{{{{IMAGE:{p.id}:{idx}}}}}' for idx in range(min(3, len(p.images) if p.images else 0))])}
"""
            info_parts.append(info)
        return "\n".join(info_parts)

    def _parse_title_content(self, text: str, products, article_type: str) -> tuple:
        """從生成文字中解析標題和內容"""
        lines = text.strip().split('\n')
        title = ""
        content_start = 0

        # 跳過分隔線（---、===、***），找第一個有意義的標題行
        skip_patterns = {'---', '===', '***', '- - -', '* * *'}
        for i, line in enumerate(lines):
            stripped = line.strip()
            if not stripped or stripped in skip_patterns:
                continue
            # 找到 markdown 標題或實質內容
            if stripped.startswith('#'):
                title = stripped.lstrip('#').strip()
            else:
                title = stripped
            content_start = i + 1
            break

        # 如果沒提取到標題，用預設
        if not title:
            product_names = [p.name for p in products]
            if article_type == "comparison":
                title = f"【比較】{' vs '.join([n[:15] for n in product_names[:3]])} 哪個值得買？"
            elif article_type == "review":
                title = f"【開箱】{product_names[0][:30]} 使用心得分享"
            else:
                title = f"【推薦】{product_names[0][:30]} 完整評測與購買指南"

        content = '\n'.join(lines[content_start:]).strip()

        return title, content



# 單例
llm_service = LLMService()
