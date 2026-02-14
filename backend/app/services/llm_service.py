"""
LLM 文章生成服務（Phase 1 Mock 版）
"""
import logging
from typing import List

logger = logging.getLogger(__name__)


class LLMService:
    """LLM 文章生成服務"""

    def generate_article(self, products, article_type: str = "comparison", target_forum: str = "goodthings") -> dict:
        """生成文章（Mock 版本）"""
        product_names = [p.name for p in products]
        product_ids = [p.id for p in products]

        if article_type == "comparison":
            title = f"【比較】{' vs '.join(product_names[:3])} 哪個值得買？"
            content = self._mock_comparison(products)
        elif article_type == "review":
            title = f"【開箱】{product_names[0]} 使用心得分享"
            content = self._mock_review(products[0])
        else:
            title = f"【推薦】{product_names[0]} 完整評測與購買指南"
            content = self._mock_seo(products[0])

        # 建立圖片標記對應
        image_map = {}
        content_with_images = content
        for p in products:
            if p.images:
                for idx, img_url in enumerate(p.images[:3]):
                    marker = f"IMAGE:{p.id}:{idx}"
                    image_map[marker] = img_url

        return {
            "title": title,
            "content": content,
            "content_with_images": content_with_images,
            "image_map": image_map,
        }

    def _mock_comparison(self, products) -> str:
        """生成 mock 比較文"""
        lines = ["## 前言", "", "最近很多人問我這幾款商品到底差在哪裡，今天就來幫大家做個詳細的比較！", ""]

        for i, p in enumerate(products):
            price_str = f"NT${p.price:,.0f}" if p.price else "價格未知"
            lines.extend([
                f"## {i+1}. {p.name}",
                "",
                f"**價格**: {price_str}",
                f"**評分**: {p.rating or 'N/A'} / 5.0",
                f"**銷量**: {p.sold or 'N/A'}",
                "",
                f"{{{{{f'IMAGE:{p.id}:0'}}}}}",
                "",
                f"這款商品{p.description[:100] if p.description else '整體表現不錯'}...",
                "",
            ])

        lines.extend([
            "## 比較總結",
            "",
            "| 項目 | " + " | ".join([p.name[:15] for p in products]) + " |",
            "|------|" + "|".join(["---" for _ in products]) + "|",
            "| 價格 | " + " | ".join([f"NT${p.price:,.0f}" if p.price else "N/A" for p in products]) + " |",
            "| 評分 | " + " | ".join([f"{p.rating or 'N/A'}" for p in products]) + " |",
            "",
            "## 結論",
            "",
            "以上就是這幾款商品的詳細比較，希望對大家有幫助！",
        ])

        return "\n".join(lines)

    def _mock_review(self, product) -> str:
        """生成 mock 開箱文"""
        price_str = f"NT${product.price:,.0f}" if product.price else "價格未知"
        return f"""## 開箱！{product.name}

大家好，今天要來開箱這款 **{product.name}**！

{{{{{f'IMAGE:{product.id}:0'}}}}}

### 基本資訊
- **價格**: {price_str}
- **評分**: {product.rating or 'N/A'} / 5.0
- **店家**: {product.shop_name or '未知'}

### 外觀與包裝

收到包裹的時候蠻驚喜的，包裝很用心。

{{{{{f'IMAGE:{product.id}:1'}}}}}

### 使用心得

{product.description[:200] if product.description else '整體使用體驗很不錯，推薦給大家！'}

### 優缺點

**優點**:
- 性價比高
- 品質不錯
- 出貨速度快

**缺點**:
- 等了比較久

### 總結

整體來說我給這款商品 **{product.rating or 4.0}** 分，推薦給需要的朋友！
"""

    def _mock_seo(self, product) -> str:
        """生成 mock SEO 文章"""
        price_str = f"NT${product.price:,.0f}" if product.price else "價格未知"
        return f"""## {product.name} 評測：值得購買嗎？【2024最新】

### 什麼是 {product.name[:20]}？

{product.name} 是一款在蝦皮上熱銷的商品，售價 {price_str}。

{{{{{f'IMAGE:{product.id}:0'}}}}}

### {product.name[:20]} 規格與特色

| 項目 | 內容 |
|------|------|
| 價格 | {price_str} |
| 評分 | {product.rating or 'N/A'} |
| 銷量 | {product.sold or 'N/A'} |

### 購買建議

推薦給正在尋找類似商品的消費者。

### 常見問題 FAQ

**Q: {product.name[:20]} 值得買嗎？**
A: 以這個價位來說，性價比相當不錯。

**Q: 在哪裡買最便宜？**
A: 目前蝦皮上有最優惠的價格。
"""


# 單例
llm_service = LLMService()
