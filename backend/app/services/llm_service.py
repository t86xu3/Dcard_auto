"""
LLM 文章生成服務 - Gemini API
"""
import logging
import re
from typing import Optional

from google import genai
from google.genai import types
from sqlalchemy.orm import Session

from app.config import settings
from app.services.prompts import get_default_prompt, DEFAULT_SYSTEM_PROMPT, SYSTEM_INSTRUCTIONS
from app.models.prompt_template import PromptTemplate
from app.services.gemini_utils import strip_markdown, track_gemini_usage

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

        # 組合系統指示（程式碼層級）+ 使用者範本
        full_system_prompt = f"{SYSTEM_INSTRUCTIONS}\n\n---\n\n以下是使用者的寫作風格範本：\n\n{system_prompt}"

        # 呼叫 Gemini API（使用 system_instruction + contents 分離）
        try:
            response = self.client.models.generate_content(
                model=settings.LLM_MODEL,
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=full_system_prompt,
                    temperature=settings.LLM_TEMPERATURE,
                    max_output_tokens=settings.LLM_MAX_TOKENS,
                ),
            )

            generated_text = response.text
            logger.info(f"Gemini API 回應成功，文字長度: {len(generated_text)}")

        except Exception as e:
            logger.error(f"Gemini API 呼叫失敗: {e}")
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

        # 追蹤 API 用量
        track_gemini_usage(response)

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
