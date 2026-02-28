"""
SEO 長尾關鍵字研究服務
Google Autocomplete 展開 + LLM 策略生成
"""
import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime

import requests
from google import genai
from google.genai import types

from app.config import settings
from app.services.gemini_utils import track_gemini_usage

logger = logging.getLogger(__name__)

# Google Autocomplete 中文修飾詞（台灣市場常見搜尋模式）
CHINESE_MODIFIERS = [
    "推薦", "比較", "評價", "怎麼選", "ptt", "dcard",
    "便宜", "平價", "開箱", "缺點",
]


class KeywordResearchService:
    """長尾關鍵字研究服務（單例）"""

    AUTOCOMPLETE_URL = "https://suggestqueries.google.com/complete/search"
    REQUEST_DELAY = 0.5  # 每次 Autocomplete 請求間隔（秒）

    def __init__(self):
        self._gemini_client = None

    @property
    def gemini_client(self):
        if self._gemini_client is None:
            if not settings.GOOGLE_API_KEY:
                raise ValueError("GOOGLE_API_KEY 未設定")
            self._gemini_client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        return self._gemini_client

    # ── 公開方法 ──

    def research_keywords(self, products: list, user_id: int) -> dict:
        """完整關鍵字研究流程（同步）

        Args:
            products: Product ORM 物件列表
            user_id: 用戶 ID（用量追蹤）

        Returns:
            KeywordStrategy dict
        """
        # 1. 提取種子詞
        seeds = self._extract_seed_keywords(products, user_id)
        logger.info(f"種子詞提取完成: {seeds}")

        # 2. Autocomplete 展開
        autocomplete = self._expand_autocomplete(seeds)
        total = sum(len(v) for v in autocomplete.values())
        logger.info(f"Autocomplete 展開完成: {total} 個建議")

        # 3. LLM 策略生成
        strategy = self._generate_strategy(products, seeds, autocomplete, user_id)
        logger.info(f"關鍵字策略生成完成: 主關鍵字={strategy.get('primary_keyword')}")

        return strategy

    def autocomplete_preview(self, seed: str) -> list[str]:
        """單一種子詞的建議預覽（無 LLM，純 Autocomplete）"""
        suggestions = self._fetch_autocomplete(seed)
        return suggestions

    def format_keyword_context(self, strategy: dict) -> str:
        """格式化為文章生成 prompt 注入文字"""
        primary = strategy.get("primary_keyword", "")
        secondary = strategy.get("secondary_keywords", [])
        long_tail = strategy.get("long_tail_keywords", [])
        semantic = strategy.get("semantic_related", [])
        title_suggestion = strategy.get("title_suggestion", "")
        faq_questions = strategy.get("faq_questions", [])

        # 限制數量，避免 LLM 試圖全部塞入
        secondary_text = "、".join(
            (kw["keyword"] if isinstance(kw, dict) else str(kw))
            for kw in secondary[:3]
        )
        long_tail_text = "、".join(long_tail[:5])
        semantic_text = "、".join(semantic[:3])

        faq_text = ""
        for i, faq in enumerate(faq_questions[:5], 1):
            q = faq["question"] if isinstance(faq, dict) else str(faq)
            faq_text += f"Q{i}: {q}\n"

        context = (
            f"=== SEO 關鍵字策略（以下規則優先於其他指示）===\n\n"
            f"🚨 硬性規則（違反任何一條都是失敗的文章）：\n"
            f"  1. 標題長度：20-35 字，絕對不可超過 35 字\n"
            f"  2. 關鍵字密度：1-2%，超過 2% 就是關鍵字堆砌\n"
            f"  3. 段落數：8-25 段，超過 25 段就是結構鬆散\n"
            f"  4. 首段前 100 字必須自然包含主關鍵字「{primary}」\n"
            f"  5. 品牌名首次用全名，之後一律用簡稱\n\n"
            f"主關鍵字：{primary}（全文出現 3-5 次即可，多了就是堆砌）\n"
            f"次要關鍵字（各出現 1 次就好）：{secondary_text}\n"
            f"長尾詞（挑 2-3 個帶入，不必全用）：{long_tail_text}\n"
            f"語義相關詞（替換用，豐富表達）：{semantic_text}\n"
        )
        if title_suggestion:
            # 截斷過長的標題建議
            title_hint = title_suggestion if len(title_suggestion) <= 35 else title_suggestion[:30] + "..."
            context += f"\n標題參考方向（必須控制在 35 字內）：{title_hint}\n"
        if faq_text:
            context += (
                f"\nFAQ 問題（來自真實搜尋數據）：\n"
                f"{faq_text}"
            )
        context += "\n=== 以下是商品資訊 ===\n"
        return context

    # ── 內部方法 ──

    def _extract_seed_keywords(self, products: list, user_id: int) -> list[str]:
        """從商品名稱提取 1-3 個種子詞（LLM 輔助）"""
        product_names = [p.name for p in products if p.name and p.name != "待擷取"]
        if not product_names:
            raise ValueError("沒有有效的商品名稱可提取種子詞")

        names_text = "\n".join(f"- {name}" for name in product_names)
        prompt = (
            f"以下是數個蝦皮商品名稱，請從中提取 1-3 個最核心的搜尋用種子關鍵字（繁體中文）。\n"
            f"種子詞應該是使用者會在 Google 搜尋的通用品類詞，例如「保溫杯」「藍牙耳機」「洗面乳」。\n"
            f"不要包含品牌名、型號、規格等。\n\n"
            f"商品名稱：\n{names_text}\n\n"
            f"請只回傳 JSON 陣列，例如：[\"保溫杯\", \"隨行杯\"]\n"
            f"不要有任何其他文字。"
        )

        config = types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=200,
            response_mime_type="application/json",
            http_options=types.HttpOptions(timeout=30_000),
        )

        response = self.gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt],
            config=config,
        )
        track_gemini_usage(response, model="gemini-2.5-flash", user_id=user_id)

        try:
            seeds = json.loads(response.text)
            if isinstance(seeds, list) and all(isinstance(s, str) for s in seeds):
                return seeds[:3]
        except (json.JSONDecodeError, TypeError):
            pass

        # fallback: 用競品搜尋的 fallback 提取邏輯（避免抓到品牌名）
        from app.services.shopee_service import _fallback_extract_keywords
        fallback = _fallback_extract_keywords(product_names[0])
        logger.warning(f"種子詞 LLM 解析失敗，fallback: {fallback}")
        return fallback[:3] if fallback else [product_names[0][:6]]

    def _expand_autocomplete(self, seeds: list[str]) -> dict[str, list[str]]:
        """Google Autocomplete 展開（精簡版：中文修飾詞 + 高頻字母，並行請求）"""
        results = {}
        # 高頻字母（台灣中文搜尋中最常觸發有意義建議的字母）
        high_value_letters = "bcdmprs"
        year = datetime.now().year

        for seed in seeds:
            # 組裝所有查詢
            queries = [seed]  # 基礎
            queries += [f"{seed} {c}" for c in high_value_letters]
            queries += [f"{seed} {m}" for m in CHINESE_MODIFIERS]
            queries.append(f"{year} {seed} 推薦")

            # 並行請求（max 5 workers，避免被 rate limit）
            suggestions = set()
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures = {
                    executor.submit(self._fetch_autocomplete, q): q
                    for q in queries
                }
                for future in as_completed(futures):
                    try:
                        items = future.result()
                        suggestions.update(items)
                    except Exception:
                        pass

            suggestions.discard(seed)
            results[seed] = sorted(suggestions)

        return results

    def _fetch_autocomplete(self, query: str) -> list[str]:
        """單次 Google Autocomplete 請求"""
        try:
            resp = requests.get(
                self.AUTOCOMPLETE_URL,
                params={"client": "firefox", "q": query, "hl": "zh-TW"},
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()
            # 格式：["query", ["suggestion1", "suggestion2", ...]]
            if isinstance(data, list) and len(data) >= 2:
                return [s for s in data[1] if isinstance(s, str)]
        except Exception as e:
            logger.debug(f"Autocomplete 請求失敗 ({query}): {e}")
        return []

    def _generate_strategy(
        self,
        products: list,
        seeds: list[str],
        autocomplete: dict[str, list[str]],
        user_id: int,
    ) -> dict:
        """LLM 生成關鍵字策略 JSON"""
        # 組裝商品資訊
        product_info = []
        for p in products:
            info = f"- {p.name}"
            if p.price:
                info += f"（NT${p.price}）"
            if p.shop_name:
                info += f" [{p.shop_name}]"
            product_info.append(info)
        product_text = "\n".join(product_info)

        # 組裝 Autocomplete 結果（截取前 20 個避免 token 過多）
        autocomplete_text = ""
        for seed, suggestions in autocomplete.items():
            top = suggestions[:20]
            autocomplete_text += f"\n種子詞「{seed}」的搜尋建議（共{len(suggestions)}個，以下列出前{len(top)}個）：\n"
            autocomplete_text += "\n".join(f"  - {s}" for s in top)
            autocomplete_text += "\n"

        current_year = datetime.now().year

        prompt = f"""你是一位台灣 SEO 專家，專精繁體中文關鍵字研究。
請根據以下商品資訊和搜尋建議數據，產出一份完整的關鍵字策略。

=== 商品資訊 ===
{product_text}

=== Google Autocomplete 搜尋建議 ===
{autocomplete_text}

=== 任務 ===

請分析上述數據，產出以下 JSON 格式的關鍵字策略：

{{
  "primary_keyword": "主關鍵字（商業意圖最強的搜尋詞）",
  "primary_keyword_reason": "選擇原因",
  "secondary_keywords": [
    {{"keyword": "次要詞1", "intent": "commercial", "reason": "原因"}},
    {{"keyword": "次要詞2", "intent": "informational", "reason": "原因"}},
    {{"keyword": "次要詞3", "intent": "comparative", "reason": "原因"}}
  ],
  "long_tail_keywords": [
    "長尾詞1", "長尾詞2", "長尾詞3", "長尾詞4", "長尾詞5"
  ],
  "semantic_related": [
    "語義相關詞1", "語義相關詞2", "語義相關詞3", "語義相關詞4", "語義相關詞5"
  ],
  "title_suggestion": "【{current_year}XX推薦】吸引人的標題（20-35字內）",
  "title_keywords_used": ["標題中使用的關鍵字1", "關鍵字2"],
  "faq_questions": [
    {{"question": "使用者真正會搜的問題？", "source": "autocomplete", "target_keyword": "目標詞"}},
    {{"question": "問題2？", "source": "autocomplete", "target_keyword": "目標詞"}},
    {{"question": "問題3？", "source": "llm", "target_keyword": "目標詞"}},
    {{"question": "問題4？", "source": "llm", "target_keyword": "目標詞"}},
    {{"question": "問題5？", "source": "llm", "target_keyword": "目標詞"}}
  ],
  "keyword_placement_plan": {{
    "title": "標題佈局說明",
    "first_100_chars": "首段100字佈局說明",
    "intro_paragraph": "開頭段落佈局說明",
    "product_sections": "商品段落佈局說明",
    "faq_section": "FAQ段落佈局說明",
    "conclusion": "結尾佈局說明"
  }},
  "estimated_difficulty": "easy/medium/hard",
  "difficulty_reason": "難度判斷原因"
}}

=== 規則 ===
1. primary_keyword 必須是商業意圖（使用者想買東西）
2. 所有關鍵字必須是繁體中文（台灣用語）
3. FAQ 問題必須是使用者真的會搜尋的問題，優先從 Autocomplete 數據中提取
4. 語義相關詞不要重複主關鍵字，要是不同說法
5. 標題建議必須在 20-35 字內
6. secondary_keywords 提供 3-5 個
7. long_tail_keywords 提供 5-10 個
8. faq_questions 提供 5-8 個
9. 年份請使用 {current_year}
10. ⚠️ 所有 reason 欄位必須精簡，不超過 20 個中文字"""

        config = types.GenerateContentConfig(
            temperature=0.4,
            max_output_tokens=8192,
            response_mime_type="application/json",
            http_options=types.HttpOptions(timeout=60_000),
        )

        response = self.gemini_client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt],
            config=config,
        )
        track_gemini_usage(response, model="gemini-2.5-flash", user_id=user_id)

        raw = response.text or ""
        strategy = self._parse_json_robust(raw)
        if strategy is None:
            logger.error(f"關鍵字策略 JSON 解析失敗\n原始回應: {raw[:800]}")
            raise RuntimeError("關鍵字策略生成失敗：LLM 回傳非有效 JSON")
        return strategy

    @staticmethod
    def _parse_json_robust(text: str) -> dict | None:
        """容錯 JSON 解析：處理 LLM 常見的格式問題"""
        import re
        # 1. 直接解析
        try:
            return json.loads(text)
        except (json.JSONDecodeError, TypeError):
            pass

        # 2. 嘗試提取 JSON 區塊（去除 markdown code fence）
        m = re.search(r'```(?:json)?\s*([\s\S]*?)```', text)
        if m:
            try:
                return json.loads(m.group(1))
            except (json.JSONDecodeError, TypeError):
                pass

        # 3. 修復 trailing comma（LLM 常見錯誤）
        cleaned = re.sub(r',\s*([}\]])', r'\1', text)
        try:
            return json.loads(cleaned)
        except (json.JSONDecodeError, TypeError):
            pass

        # 4. 截斷的 JSON：找到最後一個完整的 } 並補齊
        last_brace = text.rfind('}')
        if last_brace > 0:
            truncated = text[:last_brace + 1]
            try:
                return json.loads(truncated)
            except (json.JSONDecodeError, TypeError):
                pass

        return None


# 模組層級單例
keyword_research_service = KeywordResearchService()
