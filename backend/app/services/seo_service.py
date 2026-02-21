"""
SEO 分析與優化服務
8 項評分引擎，針對 Dcard 平台 SEO 特性設計
"""
import re
import logging
from typing import Optional

from google import genai
from google.genai import types

from app.config import settings
from app.services.gemini_utils import strip_markdown, track_gemini_usage, track_anthropic_usage, is_anthropic_model

logger = logging.getLogger(__name__)


SEO_OPTIMIZE_PROMPT = """你是一位 Dcard SEO 優化專家，專門優化文章使其登上 Google 搜尋首頁。以下是基於實際上榜文章逆向分析的優化策略。

===== 標題優化（最高優先） =====
標題決定 60% 的 Google 排名。最佳格式：
【{年份}{關鍵字}推薦】{痛點Hook}！{N}款Dcard/PTT熱議評比：{受眾標籤}、{品牌名}
- 標題 20-35 字（Google SERP 最佳顯示範圍）
- 必須包含：年份、主關鍵字、「推薦」、「Dcard/PTT」
- 加入品牌名（長尾關鍵字入口）
- 加入受眾標籤（小資/租屋/學生等，捕獲意圖搜尋）

===== 關鍵字策略 =====
1. 首段 100 字內自然帶入主要關鍵字（Google 判斷文章主題的依據）
2. 關鍵字密度控制在 1-2%（不要堆砌）
3. 關鍵字均勻分佈在文章四等分區間
4. 加入語義相關詞（同義詞、相關概念、使用場景詞），不只重複同一關鍵字
5. 產品品牌名和型號要完整寫出（長尾關鍵字入口）

===== 結構優化 =====
確保文章包含以下 Google 排名加分結構（若缺少請補上）：
- ⭐ 10秒需求對照懶人包（快速導航，降低跳出率）
- 🔍 選購重點（3 個重點，每個有小標題 + 詳解）
- 每款產品統一格式（🧐上榜理由/💬心得/📌特色/💡提醒/💰價格/📋規格）
- 🎯 糾結終結（按需求場景最終推薦，提升停留時間）
- ❓ FAQ 區塊（至少 5 題，使用「Q：/A：」結構化格式，問題必須是 Google 常搜問題）

===== 內容優化 =====
- 文章總字數至少 3000 字（Google 深度內容判定門檻）
- 口語化、年輕化的 Dcard 風格（「老實說」「真的」「超」等）
- 心得部分要有具體場景描述（溫度、時間、地點、觸感）
- 每款產品之間用分隔線(===)隔開

⚠️ 格式規則：
- 不要使用任何 Markdown 語法（不要用 **粗體**、### 標題、- 列表等）
- 直接用純文字，搭配表情符號和分隔線(===)排版
- 保留原文中的圖片標記 {{IMAGE:...}} 不要動

⚠️ 禁止在文章中出現任何 SEO 策略說明文字（例如「搶佔 Google 首頁」「提升搜尋排名」「長尾關鍵字」等），讀者不需要知道這些。

請直接輸出優化後的完整文章（含優化後的標題），不要加任何解釋或前言。"""


# 擴大的停用詞表
STOP_WORDS = {
    '如果你', '為什麼', '怎麼樣', '哪個好', '這個', '那個', '什麼',
    '可以', '就是', '不是', '已經', '所以', '因為', '但是', '而且',
    '還是', '或者', '如果', '雖然', '只要', '只有', '一定', '應該',
    '真的', '其實', '大家', '我們', '他們', '自己', '覺得', '知道',
    '現在', '今天', '最近', '之前', '之後', '時候', '地方', '東西',
    '問題', '方法', '部分', '一些', '這些', '那些', '各位', '同學',
    '看看', '來說', '一下', '怎麼', '分享', '關於',
}


class SeoService:
    """SEO 分析服務 — 8 項評分引擎"""

    # 評分權重（總和 = 100）
    WEIGHTS = {
        "title_seo": 15,          # 標題 SEO（長度 20-35 字 + 含關鍵字）
        "keyword_density": 20,    # 關鍵字密度（1-2% 滿分）
        "keyword_placement": 15,  # 關鍵字分佈（首段 + 均勻度）
        "content_structure": 15,  # 內容結構（段落 + 列表 + 分隔線）
        "content_length": 15,     # 內容長度（1500-2500 字）
        "faq_quality": 10,        # FAQ 結構
        "media_usage": 5,         # 圖片使用
        "readability": 5,         # 可讀性
    }

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

    @staticmethod
    def _extract_keywords_from_title(title: str) -> list:
        """從標題自動提取關鍵字（改進版）"""
        keywords = []

        # 1. 提取【】內容（清除年份）
        bracket_words = re.findall(r'【(.+?)】', title)
        for w in bracket_words:
            cleaned = re.sub(r'\d{4}', '', w).strip()
            if cleaned:
                # 按標點/符號拆分
                parts = re.split(r'[，,、/\|｜\s]+', cleaned)
                for part in parts:
                    part = part.strip()
                    if 2 <= len(part) <= 8 and part not in STOP_WORDS:
                        keywords.append(part)

        # 2. 標題主體（去除【】的部分），按標點/符號拆分
        title_body = re.sub(r'【.+?】', ' ', title)
        # 按標點和符號拆分
        segments = re.split(r'[，,。！？!?\s、/\|｜～~：:（）()\-]+', title_body)
        for seg in segments:
            seg = seg.strip()
            if not seg:
                continue
            # 提取 2-8 字中文片段
            cn_matches = re.findall(r'[\u4e00-\u9fff]{2,8}', seg)
            for w in cn_matches:
                if w not in keywords and w not in STOP_WORDS:
                    keywords.append(w)
                    # 長詞漸進拆分（>4 字拆成子詞）
                    if len(w) > 4:
                        for start in range(len(w) - 1):
                            for end in range(start + 2, min(start + 5, len(w) + 1)):
                                sub = w[start:end]
                                if 2 <= len(sub) <= 4 and sub not in keywords and sub not in STOP_WORDS:
                                    keywords.append(sub)

        return keywords[:10]

    def analyze(self, title: str, content: str, keywords: Optional[list] = None) -> dict:
        """分析文章 SEO 分數（8 項指標）"""
        breakdown = {}
        suggestions = []

        if not keywords:
            keywords = self._extract_keywords_from_title(title)

        # ===== 1. 標題 SEO (15 分) =====
        title_score = self._score_title_seo(title, keywords, suggestions)
        breakdown["title_seo"] = {
            "score": title_score,
            "max": self.WEIGHTS["title_seo"],
            "label": "標題 SEO",
        }

        # ===== 2. 關鍵字密度 (20 分) =====
        density_score, density_val = self._score_keyword_density(content, keywords, suggestions)
        breakdown["keyword_density"] = {
            "score": density_score,
            "max": self.WEIGHTS["keyword_density"],
            "label": "關鍵字密度",
        }

        # ===== 3. 關鍵字分佈 (15 分) =====
        placement_score = self._score_keyword_placement(content, keywords, suggestions)
        breakdown["keyword_placement"] = {
            "score": placement_score,
            "max": self.WEIGHTS["keyword_placement"],
            "label": "關鍵字分佈",
        }

        # ===== 4. 內容結構 (15 分) =====
        structure_score = self._score_content_structure(content, suggestions)
        breakdown["content_structure"] = {
            "score": structure_score,
            "max": self.WEIGHTS["content_structure"],
            "label": "內容結構",
        }

        # ===== 5. 內容長度 (15 分) =====
        length_score = self._score_content_length(content, suggestions)
        breakdown["content_length"] = {
            "score": length_score,
            "max": self.WEIGHTS["content_length"],
            "label": "內容長度",
        }

        # ===== 6. FAQ 結構 (10 分) =====
        faq_score = self._score_faq_quality(content, suggestions)
        breakdown["faq_quality"] = {
            "score": faq_score,
            "max": self.WEIGHTS["faq_quality"],
            "label": "FAQ 結構",
        }

        # ===== 7. 圖片使用 (5 分) =====
        media_score, image_count = self._score_media_usage(content, suggestions)
        breakdown["media_usage"] = {
            "score": media_score,
            "max": self.WEIGHTS["media_usage"],
            "label": "圖片使用",
        }

        # ===== 8. 可讀性 (5 分) =====
        read_score = self._score_readability(content, suggestions)
        breakdown["readability"] = {
            "score": read_score,
            "max": self.WEIGHTS["readability"],
            "label": "可讀性",
        }

        total_score = sum(item["score"] for item in breakdown.values())

        # 按嚴重度排序建議（分數百分比低的排前面）
        suggestions.sort(key=lambda s: s.get("priority", 99) if isinstance(s, dict) else 99)
        # 轉成純文字建議列表
        suggestion_texts = []
        for s in suggestions:
            if isinstance(s, dict):
                suggestion_texts.append(s["text"])
            else:
                suggestion_texts.append(s)

        # 統計資訊
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        stats = {
            "title_length": len(title),
            "content_length": len(content),
            "paragraph_count": len(paragraphs),
            "image_count": image_count,
            "keyword_density": round(density_val, 2),
        }

        return {
            "score": round(total_score, 1),
            "max_score": 100,
            "grade": self._get_grade(total_score),
            "breakdown": breakdown,
            "suggestions": suggestion_texts,
            "keywords": keywords,
            "stats": stats,
        }

    # ── 各項評分子函數 ──

    def _score_title_seo(self, title: str, keywords: list, suggestions: list) -> float:
        """標題 SEO 評分：長度 20-35 字 + 含關鍵字"""
        max_score = self.WEIGHTS["title_seo"]
        score = 0.0
        title_len = len(title)

        # 長度分（佔 60%）
        if 20 <= title_len <= 35:
            score += max_score * 0.6
        elif 15 <= title_len <= 45:
            score += max_score * 0.4
            suggestions.append({
                "text": f"標題 {title_len} 字，Google SERP 最佳顯示為 20-35 中文字",
                "priority": 2,
            })
        else:
            score += max_score * 0.15
            suggestions.append({
                "text": f"標題 {title_len} 字，建議調整到 20-35 字（Google 搜尋結果最佳顯示範圍）",
                "priority": 1,
            })

        # 關鍵字分（佔 40%）
        if keywords:
            has_keyword = any(kw in title for kw in keywords[:3])
            if has_keyword:
                score += max_score * 0.4
            else:
                score += max_score * 0.1
                suggestions.append({
                    "text": "標題中缺少主要關鍵字，建議在標題中包含核心關鍵字",
                    "priority": 1,
                })
        else:
            score += max_score * 0.2

        return round(score, 1)

    def _score_keyword_density(self, content: str, keywords: list, suggestions: list) -> tuple:
        """關鍵字密度評分：修正公式，1-2% 滿分"""
        max_score = self.WEIGHTS["keyword_density"]
        total_chars = len(content)

        if not keywords or total_chars == 0:
            suggestions.append({
                "text": "無法分析關鍵字密度，建議在標題加入【關鍵字】標記",
                "priority": 2,
            })
            return max_score * 0.3, 0.0

        # 正確公式：每個關鍵字的出現次數 * 該關鍵字長度，加總後除以總字數
        keyword_chars = sum(content.count(kw) * len(kw) for kw in keywords)
        density = (keyword_chars / total_chars) * 100

        if 1.0 <= density <= 2.0:
            score = max_score
        elif 0.5 <= density < 1.0 or 2.0 < density <= 3.0:
            score = max_score * 0.7
            if density < 1.0:
                suggestions.append({
                    "text": f"關鍵字密度 {density:.1f}%，偏低，建議提高到 1-2%",
                    "priority": 2,
                })
            else:
                suggestions.append({
                    "text": f"關鍵字密度 {density:.1f}%，略高，建議控制在 1-2%",
                    "priority": 3,
                })
        elif density > 3.0:
            score = max_score * 0.3
            suggestions.append({
                "text": f"關鍵字密度 {density:.1f}%，過高有堆砌風險，建議降到 1-2%",
                "priority": 1,
            })
        else:
            score = max_score * 0.2
            suggestions.append({
                "text": f"關鍵字密度 {density:.1f}%，過低，建議自然融入更多關鍵字到 1-2%",
                "priority": 1,
            })

        return round(score, 1), density

    def _score_keyword_placement(self, content: str, keywords: list, suggestions: list) -> float:
        """關鍵字分佈評分：首段 100 字含關鍵字 + 分佈均勻度"""
        max_score = self.WEIGHTS["keyword_placement"]

        if not keywords:
            return max_score * 0.3

        score = 0.0

        # 首段 100 字包含關鍵字（佔 50%）
        first_100 = content[:100]
        has_early_keyword = any(kw in first_100 for kw in keywords[:3])
        if has_early_keyword:
            score += max_score * 0.5
        else:
            suggestions.append({
                "text": "首段 100 字未包含關鍵字，對 Google 排名影響極大",
                "priority": 1,
            })

        # 分佈均勻度（佔 50%）：將內容分成 4 等分，看每段是否都有關鍵字
        if len(content) >= 200:
            quarter = len(content) // 4
            quarters_with_kw = 0
            for i in range(4):
                start = i * quarter
                end = (i + 1) * quarter if i < 3 else len(content)
                segment = content[start:end]
                if any(kw in segment for kw in keywords[:5]):
                    quarters_with_kw += 1

            spread_ratio = quarters_with_kw / 4
            score += max_score * 0.5 * spread_ratio
            if quarters_with_kw < 3:
                suggestions.append({
                    "text": f"關鍵字僅分佈在 {quarters_with_kw}/4 段落區間，建議更均勻分佈",
                    "priority": 3,
                })
        else:
            score += max_score * 0.25

        return round(score, 1)

    def _score_content_structure(self, content: str, suggestions: list) -> float:
        """內容結構評分：段落數量 + 長度控制 + 列表使用 + 分隔線"""
        max_score = self.WEIGHTS["content_structure"]
        score = 0.0

        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip()]
        para_count = len(paragraphs)

        # 段落數量（佔 35%）
        if 8 <= para_count <= 25:
            score += max_score * 0.35
        elif 5 <= para_count <= 30:
            score += max_score * 0.2
            suggestions.append({
                "text": f"段落數 {para_count}，建議 8-25 段提升閱讀體驗",
                "priority": 3,
            })
        else:
            score += max_score * 0.1
            suggestions.append({
                "text": f"段落數 {para_count}，{'過少' if para_count < 5 else '過多'}，建議 8-25 段",
                "priority": 2,
            })

        # 段落長度控制（佔 25%）：無超長段落
        if paragraphs:
            avg_len = sum(len(p) for p in paragraphs) / len(paragraphs)
            long_paras = sum(1 for p in paragraphs if len(p) > 300)
            if long_paras == 0 and 30 <= avg_len <= 200:
                score += max_score * 0.25
            elif long_paras <= 2:
                score += max_score * 0.15
            else:
                score += max_score * 0.05
                suggestions.append({
                    "text": f"有 {long_paras} 個段落超過 300 字，建議拆分",
                    "priority": 3,
                })

        # 列表/項目符號使用（佔 20%）
        list_items = len(re.findall(r'^[-*●👉➡️✅✨❤️😁💰🔍❓]\s*', content, re.MULTILINE))
        if list_items >= 3:
            score += max_score * 0.2
        elif list_items >= 1:
            score += max_score * 0.1
        else:
            suggestions.append({
                "text": "建議使用項目符號或 emoji 整理重點，提升可讀性",
                "priority": 4,
            })

        # 分隔線使用（佔 20%）
        separator_count = len(re.findall(r'={3,}|—{3,}|─{3,}', content))
        if separator_count >= 2:
            score += max_score * 0.2
        elif separator_count >= 1:
            score += max_score * 0.1
        else:
            score += max_score * 0.05

        return round(score, 1)

    def _score_content_length(self, content: str, suggestions: list) -> float:
        """內容長度評分：1500-2500 字滿分"""
        max_score = self.WEIGHTS["content_length"]
        content_len = len(content)

        if 1500 <= content_len <= 2500:
            return max_score
        elif 1000 <= content_len < 1500:
            suggestions.append({
                "text": f"內容 {content_len} 字，建議擴充到 1500-2500 字以獲得最佳 SEO 效果",
                "priority": 2,
            })
            return round(max_score * 0.7, 1)
        elif 2500 < content_len <= 3500:
            return round(max_score * 0.85, 1)
        elif content_len > 3500:
            return round(max_score * 0.7, 1)
        elif 500 <= content_len < 1000:
            suggestions.append({
                "text": f"內容僅 {content_len} 字，SEO 效果有限，建議至少 1500 字",
                "priority": 1,
            })
            return round(max_score * 0.4, 1)
        else:
            suggestions.append({
                "text": f"內容僅 {content_len} 字，遠低於 SEO 建議的 1500 字",
                "priority": 1,
            })
            return round(max_score * 0.15, 1)

    def _score_faq_quality(self, content: str, suggestions: list) -> float:
        """FAQ 結構評分：偵測 Q/A 格式、問答題數"""
        max_score = self.WEIGHTS["faq_quality"]

        # 偵測 FAQ 模式
        # Q1: / A1: 格式
        qa_pattern = re.findall(r'Q\d+[:：]', content, re.IGNORECASE)
        # ❓ 開頭的問題
        emoji_q = re.findall(r'❓\s*.+', content)
        # 「常見問題」「FAQ」區塊
        has_faq_section = bool(re.search(r'(FAQ|常見問題|Q&A|問答)', content, re.IGNORECASE))
        # 問號結尾的行（可能是問題）
        question_lines = re.findall(r'^.{5,}[？?]\s*$', content, re.MULTILINE)

        faq_count = max(len(qa_pattern) // 2, len(emoji_q), len(question_lines))

        if faq_count >= 3 and has_faq_section:
            return max_score
        elif faq_count >= 3:
            return round(max_score * 0.8, 1)
        elif faq_count >= 1:
            suggestions.append({
                "text": f"僅偵測到 {faq_count} 個 FAQ，建議至少 3 個以提升 Google AI Overview 引用率",
                "priority": 3,
            })
            return round(max_score * 0.4, 1)
        else:
            suggestions.append({
                "text": "缺少 FAQ 區塊，FAQ 結構能讓 Google AI Overview 引用率提升 3.2 倍",
                "priority": 2,
            })
            return 0.0

    def _score_media_usage(self, content: str, suggestions: list) -> tuple:
        """圖片使用評分"""
        max_score = self.WEIGHTS["media_usage"]
        image_count = len(re.findall(r'\{\{IMAGE:\d+:\d+\}\}', content))
        # 也計算已替換的 markdown 圖片
        image_count += len(re.findall(r'!\[.*?\]\(.*?\)', content))

        if image_count >= 3:
            return max_score, image_count
        elif image_count >= 1:
            suggestions.append({
                "text": f"目前有 {image_count} 張圖片，建議至少 3 張豐富視覺內容",
                "priority": 4,
            })
            return round(max_score * 0.6, 1), image_count
        else:
            suggestions.append({
                "text": "沒有圖片，建議加入商品圖片提升文章吸引力",
                "priority": 3,
            })
            return 0.0, image_count

    def _score_readability(self, content: str, suggestions: list) -> float:
        """可讀性評分：真實分析句長 + emoji 使用"""
        max_score = self.WEIGHTS["readability"]
        score = 0.0

        # 句長分析（佔 60%）：以句號/問號/驚嘆號為斷句
        sentences = re.split(r'[。！？!?\n]+', content)
        sentences = [s.strip() for s in sentences if len(s.strip()) >= 5]
        if sentences:
            avg_sentence_len = sum(len(s) for s in sentences) / len(sentences)
            if 15 <= avg_sentence_len <= 50:
                score += max_score * 0.6
            elif 10 <= avg_sentence_len <= 70:
                score += max_score * 0.4
            else:
                score += max_score * 0.15
                suggestions.append({
                    "text": f"平均句長 {avg_sentence_len:.0f} 字，建議控制在 15-50 字",
                    "priority": 4,
                })
        else:
            score += max_score * 0.2

        # Emoji 使用（佔 40%）：Dcard 風格鼓勵適度使用 emoji
        emoji_pattern = re.compile(
            r'[\U0001F300-\U0001F9FF\U00002600-\U000027BF\U0000FE00-\U0000FEFF]'
        )
        emoji_count = len(emoji_pattern.findall(content))
        if 3 <= emoji_count <= 30:
            score += max_score * 0.4
        elif emoji_count > 0:
            score += max_score * 0.25
        else:
            score += max_score * 0.1

        return round(score, 1)

    @staticmethod
    def _get_grade(score: float) -> str:
        if score >= 85:
            return "A"
        elif score >= 70:
            return "B"
        elif score >= 50:
            return "C"
        else:
            return "D"

    def optimize_with_llm(self, article, model: Optional[str] = None, user_id: Optional[int] = None) -> dict:
        """使用 LLM 進行 SEO 優化"""
        content = article.content or ""

        # 先分析現狀
        before_analysis = self.analyze(title=article.title, content=content)
        keywords = before_analysis.get("keywords", [])

        # 組合包含具體關鍵字和分數明細的訊息
        breakdown_text = ""
        for key, item in before_analysis["breakdown"].items():
            pct = round(item["score"] / item["max"] * 100) if item["max"] > 0 else 0
            breakdown_text += f"  - {item['label']}: {item['score']}/{item['max']} ({pct}%)\n"

        user_message = f"""以下是需要 SEO 優化的文章：

標題：{article.title}

內容：
{content}

目標看板：{article.target_forum}

=== SEO 分析結果 ===
總分：{before_analysis['score']}/{before_analysis['max_score']} ({before_analysis['grade']})
分項：
{breakdown_text}
提取的關鍵字：{', '.join(keywords)}

現有 SEO 問題：
{chr(10).join(f'- {s}' for s in before_analysis['suggestions'])}

請特別注意：
- 主要關鍵字：{', '.join(keywords[:3])}
- 首段 100 字內要帶入主要關鍵字
- 關鍵字密度目標 1-2%
- FAQ 用 Q1:/A1: 結構化格式
"""

        # SEO 優化強制使用最便宜的模型（節省成本，SEO 改寫不需要高階模型）
        use_model = "gemini-2.5-flash"
        try:
            if is_anthropic_model(use_model):
                response = self.anthropic_client.messages.create(
                    model=use_model,
                    max_tokens=settings.LLM_MAX_TOKENS,
                    system=SEO_OPTIMIZE_PROMPT,
                    messages=[{"role": "user", "content": user_message}],
                )
                optimized_content = response.content[0].text
                logger.info(f"Claude SEO 優化完成，文字長度: {len(optimized_content)}")
                track_anthropic_usage(response, model=use_model, user_id=user_id)
            else:
                response = self.gemini_client.models.generate_content(
                    model=use_model,
                    contents=user_message,
                    config=types.GenerateContentConfig(
                        system_instruction=SEO_OPTIMIZE_PROMPT,
                        temperature=0.5,
                        max_output_tokens=settings.LLM_MAX_TOKENS,
                        http_options=types.HttpOptions(timeout=300_000),  # 毫秒，300秒
                    ),
                )
                optimized_content = response.text
                logger.info(f"Gemini SEO 優化完成，文字長度: {len(optimized_content)}")
                track_gemini_usage(response, model=use_model, user_id=user_id)

            # 清除可能殘留的 Markdown
            optimized_content = strip_markdown(optimized_content)

            # 從 LLM 輸出中解析優化後的標題（第一個非空行）
            optimized_title = article.title  # 預設保留原標題
            lines = optimized_content.strip().split('\n')
            skip_patterns = {'---', '===', '***', '- - -', '* * *'}
            for i, line in enumerate(lines):
                stripped = line.strip()
                if not stripped or stripped in skip_patterns:
                    continue
                # 第一個有意義的行作為標題
                optimized_title = stripped.lstrip('#').strip()
                optimized_content = '\n'.join(lines[i + 1:]).strip()
                break

            # 優化後重新分析（使用新標題）
            after_analysis = self.analyze(title=optimized_title, content=optimized_content)

            return {
                "optimized_title": optimized_title,
                "optimized_content": optimized_content,
                "score": after_analysis["score"],
                "suggestions": after_analysis["suggestions"],
                "before_score": before_analysis["score"],
                "before_analysis": before_analysis,
                "after_analysis": after_analysis,
            }

        except Exception as e:
            logger.error(f"SEO LLM 優化失敗 ({use_model}): {e}")
            raise RuntimeError(f"SEO 優化失敗: {e}")


# 單例
seo_service = SeoService()
