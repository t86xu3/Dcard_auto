"""
SEO 分析與優化服務
"""
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class SeoService:
    """SEO 分析服務"""

    # 評分權重
    WEIGHTS = {
        "title_length": 15,      # 標題長度 (15-30 字)
        "keyword_density": 20,   # 關鍵字密度 (1-3%)
        "heading_structure": 15, # 小標題結構
        "paragraph_length": 10,  # 段落長度
        "content_length": 15,    # 內容長度
        "image_markers": 10,     # 圖片標記
        "list_usage": 5,         # 列表使用
        "link_density": 5,       # 連結比例
        "readability": 5,        # 可讀性
    }

    def analyze(self, title: str, content: str, keywords: Optional[list] = None) -> dict:
        """分析文章 SEO 分數"""
        scores = {}
        suggestions = []

        # 1. 標題長度
        title_len = len(title)
        if 15 <= title_len <= 30:
            scores["title_length"] = self.WEIGHTS["title_length"]
        elif 10 <= title_len <= 40:
            scores["title_length"] = self.WEIGHTS["title_length"] * 0.7
            suggestions.append(f"標題長度 {title_len} 字，建議調整到 15-30 字")
        else:
            scores["title_length"] = self.WEIGHTS["title_length"] * 0.3
            suggestions.append(f"標題長度 {title_len} 字，偏離最佳範圍（15-30 字）")

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
            suggestions.append("建議提供關鍵字以進行密度分析")

        # 3. 小標題結構
        headings = re.findall(r'^#{1,3}\s+.+', content, re.MULTILINE)
        h2_count = len(re.findall(r'^##\s+.+', content, re.MULTILINE))
        if h2_count >= 3:
            scores["heading_structure"] = self.WEIGHTS["heading_structure"]
        elif h2_count >= 1:
            scores["heading_structure"] = self.WEIGHTS["heading_structure"] * 0.6
            suggestions.append(f"目前有 {h2_count} 個小標題，建議至少 3 個")
        else:
            scores["heading_structure"] = 0
            suggestions.append("缺少小標題（## 標記），建議加入結構化標題")

        # 4. 段落長度
        paragraphs = [p.strip() for p in content.split("\n\n") if p.strip() and not p.strip().startswith("#")]
        avg_para_len = sum(len(p) for p in paragraphs) / len(paragraphs) if paragraphs else 0
        if 50 <= avg_para_len <= 200:
            scores["paragraph_length"] = self.WEIGHTS["paragraph_length"]
        elif 30 <= avg_para_len <= 300:
            scores["paragraph_length"] = self.WEIGHTS["paragraph_length"] * 0.6
        else:
            scores["paragraph_length"] = self.WEIGHTS["paragraph_length"] * 0.3
            suggestions.append("段落長度不均，建議每段 50-200 字")

        # 5. 內容長度
        content_len = len(content)
        if content_len >= 1500:
            scores["content_length"] = self.WEIGHTS["content_length"]
        elif content_len >= 800:
            scores["content_length"] = self.WEIGHTS["content_length"] * 0.7
            suggestions.append(f"內容長度 {content_len} 字，建議至少 1500 字")
        else:
            scores["content_length"] = self.WEIGHTS["content_length"] * 0.3
            suggestions.append(f"內容僅 {content_len} 字，SEO 效果有限")

        # 6. 圖片標記
        image_count = len(re.findall(r'\{\{IMAGE:\d+:\d+\}\}', content))
        if image_count >= 3:
            scores["image_markers"] = self.WEIGHTS["image_markers"]
        elif image_count >= 1:
            scores["image_markers"] = self.WEIGHTS["image_markers"] * 0.6
            suggestions.append(f"目前有 {image_count} 張圖片，建議至少 3 張")
        else:
            scores["image_markers"] = 0
            suggestions.append("沒有圖片，建議加入商品圖片")

        # 7. 列表使用
        list_items = len(re.findall(r'^[-*]\s+', content, re.MULTILINE))
        if list_items >= 3:
            scores["list_usage"] = self.WEIGHTS["list_usage"]
        elif list_items >= 1:
            scores["list_usage"] = self.WEIGHTS["list_usage"] * 0.5
        else:
            scores["list_usage"] = 0
            suggestions.append("建議使用列表（-/*）整理重點")

        # 8. 連結
        scores["link_density"] = self.WEIGHTS["link_density"] * 0.5  # 暫無連結分析

        # 9. 可讀性
        scores["readability"] = self.WEIGHTS["readability"] * 0.8  # 基礎分

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
                "heading_count": len(headings),
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
        """LLM 優化（Mock 版本）"""
        analysis = self.analyze(
            title=article.title,
            content=article.content or "",
        )
        return {
            "optimized_content": article.content,
            "score": analysis["score"],
            "suggestions": analysis["suggestions"],
        }


# 單例
seo_service = SeoService()
