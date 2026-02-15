"""
SEO 分析與優化服務
"""
import re
import logging
from typing import Optional

from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)


SEO_OPTIMIZE_PROMPT = """你是一位 Dcard SEO 優化專家。請針對以下文章進行 SEO 優化，但保持原文風格和口語化語氣不變。

優化重點：
1. 在文章中自然地加入更多長尾關鍵字（根據產品類型推測常見搜尋詞）
2. 確保關鍵字密度在 1-3% 之間
3. 加強前言的吸引力，讓讀者想繼續看
4. 優化 FAQ 區塊，確保問題是 Google 常見搜尋問題
5. 確保文章字數至少 1500 字
6. 保持口語化、年輕化的 Dcard 風格

⚠️ 格式規則：
- 不要使用任何 Markdown 語法（不要用 **粗體**、### 標題、- 列表等）
- 直接用純文字，搭配表情符號和分隔線(===)排版
- 保留原文中的圖片標記 {{IMAGE:...}} 不要動

⚠️ 禁止在文章中出現任何 SEO 策略說明文字（例如「搶佔 Google 首頁」「提升搜尋排名」「長尾關鍵字」等），讀者不需要知道這些。

請直接輸出優化後的完整文章，不要加任何解釋或前言。"""


class SeoService:
    """SEO 分析服務"""

    # 評分權重
    WEIGHTS = {
        "title_length": 20,      # 標題長度 (15-30 字)
        "keyword_density": 25,   # 關鍵字密度 (1-3%)
        "paragraph_length": 10,  # 段落長度
        "content_length": 20,    # 內容長度
        "image_markers": 10,     # 圖片標記
        "list_usage": 10,        # 列表使用
        "link_density": 5,       # 連結比例
        "readability": 5,        # 可讀性
    }

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            if not settings.GOOGLE_API_KEY:
                raise ValueError("GOOGLE_API_KEY 未設定")
            self._client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        return self._client

    @staticmethod
    def _extract_keywords_from_title(title: str) -> list:
        """從標題自動提取關鍵字（【】內的詞 + 中文詞組）"""
        keywords = []
        # 提取【】內的關鍵字
        bracket_words = re.findall(r'【(.+?)】', title)
        for w in bracket_words:
            # 拆分年份+關鍵字，如 "2024貓砂鏟推薦" → "貓砂鏟", "推薦"
            cleaned = re.sub(r'\d{4}', '', w).strip()
            if cleaned:
                keywords.append(cleaned)
        # 提取有意義的中文詞組（2-6字）
        cn_words = re.findall(r'[\u4e00-\u9fff]{2,6}', title)
        for w in cn_words:
            if w not in keywords and w not in ('如果你', '為什麼', '怎麼樣', '哪個好'):
                keywords.append(w)
        return keywords[:8]  # 最多取 8 個

    def analyze(self, title: str, content: str, keywords: Optional[list] = None) -> dict:
        """分析文章 SEO 分數"""
        scores = {}
        suggestions = []

        # 沒有提供關鍵字時，從標題自動提取
        if not keywords:
            keywords = self._extract_keywords_from_title(title)

        # 1. 標題長度（Dcard SEO 標題通常較長，30-80 字為最佳）
        title_len = len(title)
        if 30 <= title_len <= 80:
            scores["title_length"] = self.WEIGHTS["title_length"]
        elif 15 <= title_len <= 120:
            scores["title_length"] = self.WEIGHTS["title_length"] * 0.7
            suggestions.append(f"標題長度 {title_len} 字，建議調整到 30-80 字")
        else:
            scores["title_length"] = self.WEIGHTS["title_length"] * 0.3
            suggestions.append(f"標題長度 {title_len} 字，偏離最佳範圍（30-80 字）")

        # 2. 關鍵字密度
        if keywords:
            total_chars = len(content)
            keyword_count = sum(content.count(kw) for kw in keywords)
            density = (keyword_count * sum(len(kw) for kw in keywords)) / total_chars * 100 if total_chars > 0 else 0

            if 1 <= density <= 3:
                scores["keyword_density"] = self.WEIGHTS["keyword_density"]
            elif 0.5 <= density <= 5:
                scores["keyword_density"] = self.WEIGHTS["keyword_density"] * 0.6
                suggestions.append(f"關鍵字密度 {density:.1f}%，建議維持在 1-3%")
            else:
                scores["keyword_density"] = self.WEIGHTS["keyword_density"] * 0.2
                suggestions.append(f"關鍵字密度 {density:.1f}%，需要調整")
        else:
            scores["keyword_density"] = self.WEIGHTS["keyword_density"] * 0.5
            suggestions.append("標題中未能提取關鍵字，建議加入【關鍵字】標記")

        # 3. 段落長度
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        avg_para_len = sum(len(p) for p in paragraphs) / len(paragraphs) if paragraphs else 0
        if 50 <= avg_para_len <= 200:
            scores["paragraph_length"] = self.WEIGHTS["paragraph_length"]
        elif 30 <= avg_para_len <= 300:
            scores["paragraph_length"] = self.WEIGHTS["paragraph_length"] * 0.6
        else:
            scores["paragraph_length"] = self.WEIGHTS["paragraph_length"] * 0.3
            suggestions.append("段落長度不均，建議每段 50-200 字")

        # 4. 內容長度
        content_len = len(content)
        if content_len >= 1500:
            scores["content_length"] = self.WEIGHTS["content_length"]
        elif content_len >= 800:
            scores["content_length"] = self.WEIGHTS["content_length"] * 0.7
            suggestions.append(f"內容長度 {content_len} 字，建議至少 1500 字")
        else:
            scores["content_length"] = self.WEIGHTS["content_length"] * 0.3
            suggestions.append(f"內容僅 {content_len} 字，SEO 效果有限")

        # 5. 圖片標記
        image_count = len(re.findall(r'\{\{IMAGE:\d+:\d+\}\}', content))
        if image_count >= 3:
            scores["image_markers"] = self.WEIGHTS["image_markers"]
        elif image_count >= 1:
            scores["image_markers"] = self.WEIGHTS["image_markers"] * 0.6
            suggestions.append(f"目前有 {image_count} 張圖片，建議至少 3 張")
        else:
            scores["image_markers"] = 0
            suggestions.append("沒有圖片，建議加入商品圖片")

        # 6. 列表使用（表情符號項目符號也算）
        list_items = len(re.findall(r'^[-*●👉➡️✅✨❤️😁💰🔍❓]\s*', content, re.MULTILINE))
        if list_items >= 3:
            scores["list_usage"] = self.WEIGHTS["list_usage"]
        elif list_items >= 1:
            scores["list_usage"] = self.WEIGHTS["list_usage"] * 0.5
        else:
            scores["list_usage"] = 0
            suggestions.append("建議使用項目符號整理重點")

        # 7. 連結
        scores["link_density"] = self.WEIGHTS["link_density"] * 0.5

        # 8. 可讀性
        scores["readability"] = self.WEIGHTS["readability"] * 0.8

        total_score = sum(scores.values())

        return {
            "score": round(total_score, 1),
            "max_score": 100,
            "grade": self._get_grade(total_score),
            "breakdown": scores,
            "suggestions": suggestions,
            "stats": {
                "title_length": title_len,
                "content_length": content_len,
                "paragraph_count": len(paragraphs),
                "image_count": image_count,
                "list_items": list_items,
            },
        }

    def _get_grade(self, score: float) -> str:
        if score >= 85:
            return "A"
        elif score >= 70:
            return "B"
        elif score >= 50:
            return "C"
        else:
            return "D"

    def optimize_with_llm(self, article) -> dict:
        """使用 LLM 進行 SEO 優化"""
        content = article.content or ""

        # 先分析現狀
        before_analysis = self.analyze(title=article.title, content=content)

        user_message = f"""以下是需要 SEO 優化的文章：

標題：{article.title}

內容：
{content}

目標看板：{article.target_forum}

現有 SEO 問題：
{chr(10).join(f'- {s}' for s in before_analysis['suggestions'])}
"""

        try:
            response = self.client.models.generate_content(
                model=settings.LLM_MODEL,
                contents=user_message,
                config=types.GenerateContentConfig(
                    system_instruction=SEO_OPTIMIZE_PROMPT,
                    temperature=0.5,
                    max_output_tokens=settings.LLM_MAX_TOKENS,
                ),
            )

            optimized_content = response.text
            logger.info(f"SEO LLM 優化完成，文字長度: {len(optimized_content)}")

            # 清除可能殘留的 Markdown
            from app.services.llm_service import LLMService
            optimized_content = LLMService._strip_markdown(optimized_content)

            # 優化後重新分析
            after_analysis = self.analyze(title=article.title, content=optimized_content)

            # 追蹤用量
            self._track_usage(response)

            return {
                "optimized_content": optimized_content,
                "score": after_analysis["score"],
                "suggestions": after_analysis["suggestions"],
                "before_score": before_analysis["score"],
            }

        except Exception as e:
            logger.error(f"SEO LLM 優化失敗: {e}")
            raise RuntimeError(f"SEO 優化失敗: {e}")

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
        except Exception as e:
            logger.warning(f"用量追蹤失敗: {e}")


# 單例
seo_service = SeoService()
