"""
LLM 文章生成服務 - 支援 Gemini + Anthropic Claude（含多模態圖片輸入）
"""
import base64
import logging
import re
import time
from concurrent.futures import ThreadPoolExecutor
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
            self._gemini_client = genai.Client(
                api_key=settings.GOOGLE_API_KEY,
            )
        return self._gemini_client

    @property
    def anthropic_client(self):
        if self._anthropic_client is None:
            if not settings.ANTHROPIC_API_KEY:
                raise ValueError("ANTHROPIC_API_KEY 未設定，請在 .env 中設定")
            import anthropic
            self._anthropic_client = anthropic.Anthropic(
                api_key=settings.ANTHROPIC_API_KEY,
                timeout=300.0,
            )
        return self._anthropic_client

    def _download_images(self, products, image_sources: list[str]) -> list[tuple[bytes, str]]:
        """下載商品圖片供 LLM 多模態分析（平行下載）

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

        def _fetch_one(url):
            try:
                with httpx.Client(timeout=10.0) as client:
                    resp = client.get(url)
                    resp.raise_for_status()
                    img_bytes = resp.content
                    if len(img_bytes) < 1024:
                        logger.warning(f"圖片太小（{len(img_bytes)} bytes），跳過: {url[:80]}...")
                        return None
                    content_type = resp.headers.get("content-type", "image/jpeg")
                    mime_type = content_type.split(";")[0].strip().lower()
                    allowed_types = {"image/jpeg", "image/png", "image/gif", "image/webp"}
                    if mime_type not in allowed_types:
                        mime_type = "image/jpeg"
                    logger.debug(f"圖片下載成功: {url[:80]}...")
                    return (img_bytes, mime_type)
            except Exception as e:
                logger.warning(f"圖片下載失敗（跳過）: {url[:80]}... - {e}")
                return None

        image_parts = []
        with ThreadPoolExecutor(max_workers=5) as executor:
            results = executor.map(_fetch_one, image_urls)
            for result in results:
                if result is not None:
                    image_parts.append(result)

        logger.info(f"共下載 {len(image_parts)}/{len(image_urls)} 張圖片供 LLM 分析")
        return image_parts

    def _call_gemini(self, use_model: str, system_prompt: str, user_message: str, image_parts: list[tuple[bytes, str]] | None = None, max_retries: int = 3) -> tuple:
        """呼叫 Gemini API，回傳 (generated_text, response)。圖片失敗時自動 fallback 為純文字。超時/暫時性錯誤自動重試。"""
        contents = [user_message]
        if image_parts:
            for img_bytes, mime_type in image_parts:
                contents.append(types.Part.from_bytes(data=img_bytes, mime_type=mime_type))

        retry_history = []
        for attempt in range(max_retries):
            # 每次重試都建立新的 config，帶上 per-request http_options 強制 timeout
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                temperature=settings.LLM_TEMPERATURE,
                max_output_tokens=settings.LLM_MAX_TOKENS,
                http_options=types.HttpOptions(timeout=300_000),  # 毫秒，300秒
            )
            attempt_start = time.time()
            try:
                response = self.gemini_client.models.generate_content(
                    model=use_model, contents=contents, config=config,
                )
                if retry_history:
                    logger.info(f"Gemini API 第 {attempt+1} 次嘗試成功（前 {len(retry_history)} 次失敗）")
                return response.text, response
            except Exception as e:
                elapsed = round(time.time() - attempt_start, 1)
                error_str = str(e).lower()
                retry_history.append(f"第{attempt+1}次({elapsed}s): {type(e).__name__}: {str(e)[:200]}")
                # 圖片錯誤：fallback 純文字（不重試）
                if image_parts and "image" in error_str:
                    logger.warning(f"Gemini 圖片處理失敗，改用純文字模式重試: {e}")
                    contents = [user_message]
                    image_parts = None
                    continue
                # 超時或暫時性錯誤：重試
                if any(kw in error_str for kw in ["timed out", "timeout", "503", "500", "overloaded", "unavailable"]):
                    wait = 2 ** attempt * 5  # 5s, 10s, 20s
                    logger.warning(f"Gemini API 暫時性錯誤（第 {attempt+1}/{max_retries} 次），{wait}s 後重試: {e}")
                    time.sleep(wait)
                    continue
                # 不可重試的錯誤
                error = RuntimeError(f"Gemini API 錯誤: {e}")
                error.retry_history = retry_history
                raise error
        error = RuntimeError(f"Gemini API {max_retries} 次重試均失敗")
        error.retry_history = retry_history
        raise error

    def _extract_image_info(self, image_parts: list[tuple[bytes, str]], user_id: int | None = None, max_images: int = 8) -> str:
        """用 Gemini Flash 提取圖片中的文字資訊（成本極低）

        當使用 Claude 模型時，先用此方法讀圖，再把純文字傳給 Claude，
        避免 Claude 的高額圖片 token 費用。
        逐張處理，跳過 Gemini 無法解析的圖片。
        限制最多處理 max_images 張，避免超時。
        """
        # 限制圖片數量，避免逐張呼叫 API 超時（每張約 5-10 秒）
        if len(image_parts) > max_images:
            logger.info(f"圖片數量 {len(image_parts)} 超過上限 {max_images}，僅處理前 {max_images} 張")
            image_parts = image_parts[:max_images]

        extract_prompt = (
            "請仔細閱讀這張商品圖片，提取所有有用的文字資訊，包括但不限於：\n"
            "- 商品規格、尺寸、重量\n"
            "- 成分表、材質說明\n"
            "- 使用方式、注意事項\n"
            "- 賣點文案、促銷資訊\n"
            "- 任何圖片中可見的文字\n\n"
            "請以條列方式整理，保留原始文字，不要加入你的評論。如果圖片中沒有文字，簡短描述圖片內容。"
        )

        results = []
        for i, (img_bytes, mime_type) in enumerate(image_parts):
            try:
                contents = [
                    extract_prompt,
                    types.Part.from_bytes(data=img_bytes, mime_type=mime_type),
                ]
                response = self.gemini_client.models.generate_content(
                    model="gemini-2.5-flash",
                    contents=contents,
                    config=types.GenerateContentConfig(
                        temperature=0.1,
                        max_output_tokens=2048,
                    ),
                )
                if response.text:
                    results.append(f"【圖片 {i+1}】\n{response.text}")
                track_gemini_usage(response, model="gemini-2.5-flash", user_id=user_id)
            except Exception as e:
                logger.warning(f"圖片 {i+1}/{len(image_parts)} 提取失敗（跳過）: {e}")

        logger.info(f"Gemini Flash 圖片文字提取完成：{len(results)}/{len(image_parts)} 張成功")
        return "\n\n".join(results)

    def _call_anthropic(self, use_model: str, system_prompt: str, user_message: str, image_parts: list[tuple[bytes, str]] | None = None, max_retries: int = 3) -> tuple:
        """呼叫 Anthropic Claude API，回傳 (generated_text, response)。超時/暫時性錯誤自動重試。"""
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

        retry_history = []
        for attempt in range(max_retries):
            attempt_start = time.time()
            try:
                response = self.anthropic_client.messages.create(
                    model=use_model,
                    max_tokens=settings.LLM_MAX_TOKENS,
                    system=system_prompt,
                    messages=[{"role": "user", "content": content}],
                )
                generated_text = response.content[0].text
                if retry_history:
                    logger.info(f"Claude API 第 {attempt+1} 次嘗試成功（前 {len(retry_history)} 次失敗）")
                return generated_text, response
            except Exception as e:
                elapsed = round(time.time() - attempt_start, 1)
                error_str = str(e).lower()
                retry_history.append(f"第{attempt+1}次({elapsed}s): {type(e).__name__}: {str(e)[:200]}")
                if any(kw in error_str for kw in ["timed out", "timeout", "529", "503", "500", "overloaded", "unavailable"]):
                    wait = 2 ** attempt * 5
                    logger.warning(f"Claude API 暫時性錯誤（第 {attempt+1}/{max_retries} 次），{wait}s 後重試: {e}")
                    time.sleep(wait)
                    continue
                error = RuntimeError(f"Claude API 錯誤: {e}")
                error.retry_history = retry_history
                raise error
        error = RuntimeError(f"Claude API {max_retries} 次重試均失敗")
        error.retry_history = retry_history
        raise error

    def generate_article(self, products, db: Session, article_type: str = "comparison", target_forum: str = "goodthings", prompt_template_id: Optional[int] = None, model: Optional[str] = None, user_id: Optional[int] = None, include_images: bool = False, image_sources: list[str] | None = None) -> dict:
        """生成文章"""
        product_ids = [p.id for p in products]

        # 準備商品資訊
        products_info = self._format_products_info(products)

        # 載入 system prompt（從 DB 或預設）
        if prompt_template_id:
            template = db.query(PromptTemplate).filter(PromptTemplate.id == prompt_template_id).first()
            system_prompt = template.content if template else get_default_prompt(db, user_id=user_id)
        else:
            system_prompt = get_default_prompt(db, user_id=user_id)

        # 組合使用者訊息（商品資料），注入當前年份
        from datetime import datetime
        current_year = datetime.now().year
        user_message = f"⚠️ 當前年份是 {current_year} 年，標題和文章中提到年份時必須使用 {current_year}。\n\n目標看板：{target_forum}\n\n以下是商品資料，請根據這些資訊撰寫文章：\n\n{products_info}"

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
                # 兩階段策略：Claude 模型 + 有圖片時，先用 Gemini Flash 讀圖（極低成本），
                # 再把提取的純文字傳給 Claude，避免 Claude 高額的圖片 token 費用
                if image_parts:
                    logger.info(f"兩階段圖片分析：先用 Gemini Flash 提取 {len(image_parts)} 張圖片文字...")
                    extracted_text = self._extract_image_info(image_parts, user_id=user_id)
                    if extracted_text:
                        user_message += f"\n\n以下是從商品圖片中提取的詳細資訊：\n{extracted_text}"
                    # 不傳圖片給 Claude，只傳純文字
                    image_parts = None

                generated_text, response = self._call_anthropic(use_model, full_system_prompt, user_message, image_parts=None)
                logger.info(f"Claude API 回應成功，文字長度: {len(generated_text)}")
                track_anthropic_usage(response, model=use_model, user_id=user_id)
            else:
                # Gemini 模型直接傳圖片（成本已經很低）
                generated_text, response = self._call_gemini(use_model, full_system_prompt, user_message, image_parts=image_parts)
                logger.info(f"Gemini API 回應成功，文字長度: {len(generated_text)}")
                track_gemini_usage(response, model=use_model, user_id=user_id)

        except Exception as e:
            logger.error(f"LLM API 呼叫失敗 ({use_model}), 商品數={len(products)}, 附圖={bool(image_parts)}: {type(e).__name__}: {e}")
            new_error = RuntimeError(f"文章生成失敗: {e}")
            # 保留 retry_history 供錯誤報告使用
            if hasattr(e, "retry_history"):
                new_error.retry_history = e.retry_history
            raise new_error from e

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

        # 清除殘留的 {{IMAGE:...}} 標記（LLM 可能產生不存在的索引或自創格式）
        content = re.sub(r'\{\{IMAGE:[^}]*\}\}', '', content)
        content_with_images = re.sub(r'\{\{IMAGE:[^}]*\}\}', '', content_with_images)

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
