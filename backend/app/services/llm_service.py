"""
LLM 文章生成服務 - Gemini API
"""
import logging
from typing import Optional

from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from app.config import settings
from app.services.prompts import get_default_prompt, DEFAULT_SYSTEM_PROMPT
from app.models.prompt_template import PromptTemplate

logger = logging.getLogger(__name__)


class LLMService:
    """LLM 文章生成服務（Gemini API）"""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            if not settings.GOOGLE_API_KEY:
                raise ValueError("GOOGLE_API_KEY 未設定，請在 .env 中設定")
            self._client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        return self._client

    def generate_article(self, products, db: Session, article_type: str = "comparison", target_forum: str = "goodthings", prompt_template_id: Optional[int] = None) -> dict:
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

        # 呼叫 Gemini API（使用 system_instruction + contents 分離）
        try:
            response = self.client.models.generate_content(
                model=settings.LLM_MODEL,
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=settings.LLM_TEMPERATURE,
                    max_output_tokens=settings.LLM_MAX_TOKENS,
                ),
            )

            generated_text = response.text
            logger.info(f"Gemini API 回應成功，文字長度: {len(generated_text)}")

        except Exception as e:
            logger.error(f"Gemini API 呼叫失敗: {e}")
            raise RuntimeError(f"文章生成失敗: {e}")

        # 解析標題和內容
        title, content = self._parse_title_content(generated_text, products, article_type)

        # 建立圖片標記對應
        image_map = {}
        content_with_images = content
        for p in products:
            if p.images:
                for idx, img_url in enumerate(p.images[:3]):
                    marker = f"IMAGE:{p.id}:{idx}"
                    image_map[marker] = img_url

        # 追蹤 API 用量
        self._track_usage(response)

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

        # 嘗試從第一行提取標題
        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped:
                # 移除 markdown 標題符號
                if stripped.startswith('#'):
                    title = stripped.lstrip('#').strip()
                else:
                    title = stripped
                content_start = i + 1
                break

        # 如果標題太長或沒提取到，用預設
        if not title or len(title) > 80:
            product_names = [p.name for p in products]
            if article_type == "comparison":
                title = f"【比較】{' vs '.join([n[:15] for n in product_names[:3]])} 哪個值得買？"
            elif article_type == "review":
                title = f"【開箱】{product_names[0][:30]} 使用心得分享"
            else:
                title = f"【推薦】{product_names[0][:30]} 完整評測與購買指南"

        content = '\n'.join(lines[content_start:]).strip()

        return title, content

    def _track_usage(self, response):
        """追蹤 API 用量"""
        try:
            from app.services.usage_tracker import usage_tracker

            input_tokens = 0
            output_tokens = 0

            if hasattr(response, 'usage_metadata') and response.usage_metadata:
                input_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0) or 0
                output_tokens = getattr(response.usage_metadata, 'candidates_token_count', 0) or 0

            usage_tracker.track(
                requests=1,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )
            logger.info(f"API 用量: input={input_tokens}, output={output_tokens}")
        except Exception as e:
            logger.warning(f"用量追蹤失敗: {e}")


# 單例
llm_service = LLMService()
