"""
蝦皮聯盟行銷 API 服務
GraphQL API + SHA256 簽名認證
"""
import hashlib
import json
import logging
import math
import re
import time

import requests
from google import genai
from google.genai import types

from app.config import settings

logger = logging.getLogger(__name__)


class ShopeeService:
    """蝦皮聯盟行銷 API 客戶端"""

    BASE_URL = "https://open-api.affiliate.shopee.tw/graphql"

    def __init__(self):
        self.app_id = settings.SHOPEE_APP_ID
        self.secret = settings.SHOPEE_SECRET

    @property
    def is_configured(self) -> bool:
        return bool(self.app_id and self.secret)

    def _sign(self, payload: str) -> tuple:
        """SHA256 簽名"""
        timestamp = int(time.time())
        raw = f"{self.app_id}{timestamp}{payload}{self.secret}"
        signature = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        return signature, timestamp

    def _request(self, query: str, variables: dict = None) -> dict:
        """發送 GraphQL 請求"""
        if not self.is_configured:
            return {}

        body = {"query": query}
        if variables:
            body["variables"] = variables

        payload = json.dumps(body, separators=(",", ":"))
        signature, timestamp = self._sign(payload)

        headers = {
            "Content-Type": "application/json",
            "Authorization": (
                f"SHA256 Credential={self.app_id}, "
                f"Timestamp={timestamp}, "
                f"Signature={signature}"
            ),
        }

        try:
            resp = requests.post(
                self.BASE_URL, headers=headers, data=payload, timeout=15
            )
            resp.raise_for_status()
            data = resp.json()

            if "errors" in data:
                logger.warning(f"Shopee API 錯誤: {data['errors']}")
                return {}

            return data.get("data", {})
        except Exception as e:
            logger.warning(f"Shopee API 請求失敗: {e}")
            return {}

    def get_shopee_offers(self, limit: int = 5) -> list:
        """查詢平台促銷活動"""
        query = """
        query($limit: Int) {
          shopeeOfferV2(sortType: 2, limit: $limit) {
            nodes {
              offerName
              commissionRate
              offerLink
              imageUrl
              periodStartTime
              periodEndTime
            }
          }
        }
        """
        data = self._request(query, {"limit": limit})
        return data.get("shopeeOfferV2", {}).get("nodes", [])

    def get_shop_offers(self, limit: int = 5) -> list:
        """查詢商店佣金優惠"""
        query = """
        query($limit: Int) {
          shopOfferV2(sortType: 2, limit: $limit) {
            nodes {
              shopId
              shopName
              commissionRate
              ratingStar
              shopType
              imageUrl
              offerLink
              sellerCommCoveRatio
            }
          }
        }
        """
        data = self._request(query, {"limit": limit})
        return data.get("shopOfferV2", {}).get("nodes", [])

    def get_product_offers(self, limit: int = 5) -> list:
        """查詢高佣金商品"""
        query = """
        query($limit: Int) {
          productOfferV2(sortType: 5, listType: 1, limit: $limit) {
            nodes {
              itemId
              productName
              offerLink
              imageUrl
              priceMin
              priceMax
              sales
              commissionRate
              sellerCommissionRate
              commission
              shopName
            }
          }
        }
        """
        data = self._request(query, {"limit": limit})
        return data.get("productOfferV2", {}).get("nodes", [])

    def explore_products(
        self,
        keyword: str = None,
        sort_type: int = 2,
        list_type: int = 0,
        is_ams_offer: bool = None,
        is_key_seller: bool = None,
        page: int = 1,
        limit: int = 50,
        min_commission_rate: float = None,
        min_sales: int = None,
        max_sales: int = None,
        min_price: float = None,
        max_price: float = None,
        min_rating: float = None,
        min_results: int = 20,
    ) -> dict:
        """彈性查詢商品，支援後端過濾 + 自動分頁填滿"""
        # sort_type 6 = 銷量+佣金率（自訂複合排序），API 用 sort_type=2（銷量）
        api_sort_type = 2 if sort_type == 6 else sort_type

        # 組建 GraphQL 查詢模板（page 動態替換）
        var_defs = ["$limit: Int", "$page: Int", "$sortType: Int", "$listType: Int"]
        args = ["limit: $limit", "page: $page", "sortType: $sortType", "listType: $listType"]
        base_variables = {
            "limit": limit,
            "sortType": api_sort_type,
            "listType": list_type,
        }

        if keyword:
            var_defs.append("$keyword: String")
            args.append("keyword: $keyword")
            base_variables["keyword"] = keyword
        if is_ams_offer is not None:
            var_defs.append("$isAmsOffer: Boolean")
            args.append("isAmsOffer: $isAmsOffer")
            base_variables["isAmsOffer"] = is_ams_offer
        if is_key_seller is not None:
            var_defs.append("$isKeySeller: Boolean")
            args.append("isKeySeller: $isKeySeller")
            base_variables["isKeySeller"] = is_key_seller

        query = f"""
        query({', '.join(var_defs)}) {{
          productOfferV2({', '.join(args)}) {{
            nodes {{
              itemId
              productName
              offerLink
              imageUrl
              priceMin
              priceMax
              priceDiscountRate
              sales
              commissionRate
              sellerCommissionRate
              commission
              shopName
              shopType
              ratingStar
              productLink
            }}
            pageInfo {{
              page
              limit
              hasNextPage
            }}
          }}
        }}
        """

        all_filtered = []
        total_before = 0
        current_page = page
        final_page_info = {}
        max_pages = 10  # 安全上限，避免無限迴圈
        seen_ids = set()  # 去重

        # 關鍵字相關性過濾：拆分搜尋詞，確保商品名稱至少包含一個搜尋詞
        keyword_terms = []
        if keyword:
            # 移除 emoji 後再拆分，避免 emoji 干擾比對
            clean_kw = _strip_emoji(keyword)
            keyword_terms = [t.strip() for t in clean_kw.split() if len(t.strip()) >= 2]

        for _ in range(max_pages):
            variables = {**base_variables, "page": current_page}
            data = self._request(query, variables)
            result = data.get("productOfferV2", {})
            nodes = result.get("nodes", [])
            final_page_info = result.get("pageInfo", {})
            total_before += len(nodes)

            # 型別轉換 + 後端過濾
            for item in nodes:
                item_id = item.get("itemId")
                if item_id in seen_ids:
                    continue
                seen_ids.add(item_id)

                # String → float 轉換（佣金率使用賣家加碼佣金，非平台基礎佣金）
                try:
                    cr = float(item.get("sellerCommissionRate") or 0)
                except (ValueError, TypeError):
                    cr = 0
                try:
                    price = float(item.get("priceMin") or 0)
                except (ValueError, TypeError):
                    price = 0
                try:
                    rating = float(item.get("ratingStar") or 0)
                except (ValueError, TypeError):
                    rating = 0
                sales_val = item.get("sales") or 0
                if isinstance(sales_val, str):
                    try:
                        sales_val = int(sales_val)
                    except (ValueError, TypeError):
                        sales_val = 0

                # 寫回轉換後的值供前端使用
                item["_commissionRate"] = cr
                item["_price"] = price
                item["_rating"] = rating
                item["_sales"] = sales_val
                # sellerCommissionRate 是小數（0.26 = 26%），用戶輸入百分比（5 = 5%）
                item["_commissionPct"] = round(cr * 100, 2)

                # 關鍵字相關性過濾（商品名稱必須包含至少一個搜尋詞）
                if keyword_terms:
                    product_name = item.get("productName", "")
                    if not any(term in product_name for term in keyword_terms):
                        continue

                # 數值過濾
                if min_commission_rate is not None and cr * 100 < min_commission_rate:
                    continue
                if min_sales is not None and sales_val < min_sales:
                    continue
                if max_sales is not None and sales_val > max_sales:
                    continue
                if min_price is not None and price < min_price:
                    continue
                if max_price is not None and price > max_price:
                    continue
                if min_rating is not None and rating < min_rating:
                    continue

                all_filtered.append(item)

            # 已達目標數量或沒有下一頁 → 跳出
            if len(all_filtered) >= min_results or not final_page_info.get("hasNextPage"):
                break
            current_page += 1

        # 根據 sort_type 重新排序（API 排序可能因後端過濾而亂序）
        if sort_type == 6:
            # 銷量+佣金率複合排序：銷量歸一化 (log10) * 0.5 + 佣金率歸一化 * 0.5
            def _combined_score(x):
                s = math.log10(x.get("_sales", 0) + 1)  # log10(銷量+1)
                c = x.get("_commissionPct", 0)  # 百分比 0-100
                return s * 0.5 + (c / 100) * 5 * 0.5  # 銷量 log10 max~5, 佣金率歸一化到 0-5
            all_filtered.sort(key=_combined_score, reverse=True)
        elif sort_type == 2:
            all_filtered.sort(key=lambda x: x.get("_sales", 0), reverse=True)
        elif sort_type == 3:
            all_filtered.sort(key=lambda x: x.get("_price", 0))
        elif sort_type == 4:
            all_filtered.sort(key=lambda x: x.get("_price", 0), reverse=True)
        elif sort_type == 5:
            all_filtered.sort(key=lambda x: x.get("_commissionPct", 0), reverse=True)

        return {
            "items": all_filtered,
            "total_before_filter": total_before,
            "total_after_filter": len(all_filtered),
            "page_info": final_page_info,
            "pages_fetched": current_page - page + 1,
        }


shopee_service = ShopeeService()


# ─── 競品搜尋輔助函數 ───

def extract_search_keywords(product_name: str, user_id: int = None) -> list[str]:
    """用 Gemini Flash 從商品名稱提取 2-3 個搜尋關鍵字"""
    from app.services.gemini_utils import track_gemini_usage

    model = "gemini-2.5-flash"
    try:
        client = genai.Client(api_key=settings.GOOGLE_API_KEY)
        response = client.models.generate_content(
            model=model,
            contents=f"商品名稱：{product_name}",
            config=types.GenerateContentConfig(
                system_instruction=(
                    "你是蝦皮商品搜尋關鍵字提取器。從商品名稱中提取恰好 3 個搜尋關鍵字，用於在蝦皮搜尋同類競品。\n\n"
                    "核心原則：每個關鍵字必須是「完整的產品品類名詞」，能在蝦皮搜到同類商品。\n\n"
                    "規則：\n"
                    "1. 第一個關鍵字：最精確的產品品類名（含修飾詞），如「洗衣球」「即飲奶茶」「無線耳機」\n"
                    "2. 第二個關鍵字：更廣的品類名或同義詞，如「洗衣膠囊」「奶茶」「藍牙耳機」\n"
                    "3. 第三個關鍵字：替代品類詞或使用場景詞，如「洗衣凝膠」「沖泡飲品」「耳塞式耳機」\n\n"
                    "嚴格禁止（違反會導致搜尋結果完全錯誤）：\n"
                    "- ❌ 不完整的詞片段（「原味奶」「洗衣」「保溫」）→ 必須是完整名詞（「奶茶」「洗衣球」「保溫杯」）\n"
                    "- ❌ 品牌名（立頓、P&G、Ariel、3M、Tefal、法國特福）\n"
                    "- ❌ 型號/規格數字（4D、300ml、6入、735ml、24CM、28CM）\n"
                    "- ❌ 促銷/平台文案（蝦皮直營、蝦皮獨家、蝦皮限定、現貨、免運、秒發、獨家）\n"
                    "- ❌ 單獨修飾詞（原味、日本、質感、智慧）\n"
                    "- ❌ 顏色/外觀詞（英國藍、玫瑰金、櫻花粉、曜石黑、霧面、亮面）\n"
                    "- ❌ 系列名/產品線名（戰神系列、經典系列）\n\n"
                    "格式：每行一個關鍵字，2-6 個中文字，不要編號，不要其他文字。\n\n"
                    "範例1：\n"
                    "輸入：【蝦皮直營】立頓 原味奶茶/巧克力奶茶/鮮漾奶綠/草莓奶茶 300mlX6入\n"
                    "輸出：\n即飲奶茶\n奶茶\n瓶裝奶茶\n\n"
                    "範例2：\n"
                    "輸入：日本 寶僑 P&G 4D 洗衣球 Ariel/Bold 洗衣凝膠球 盒裝 箱購\n"
                    "輸出：\n洗衣球\n洗衣凝膠球\n洗衣膠囊\n\n"
                    "範例3：\n"
                    "輸入：【未來實驗室】Midizon 衛浴殺菌除濕機 活氧 去異味\n"
                    "輸出：\n殺菌除濕機\n除濕機\n衛浴除濕機\n\n"
                    "範例4：\n"
                    "輸入：Twinko💖[HM231]➤獨家自訂款系列*質感陶瓷內層保溫杯735ml/保溫瓶/陶瓷保溫/隨行杯\n"
                    "輸出：\n陶瓷保溫杯\n保溫瓶\n隨行杯\n\n"
                    "範例5：\n"
                    "輸入：📌桌面增高架/螢幕增高架 鍵盤架 螢幕架 電腦增高架 墊高架 螢幕增高 電腦螢幕增高架\n"
                    "輸出：\n螢幕增高架\n電腦增高架\n桌面增高架\n\n"
                    "範例6：\n"
                    "輸入：Tefal法國特福 鈦合金強化-藍調24CM不沾平底鍋 英國藍｜蝦皮獨家\n"
                    "輸出：\n不沾平底鍋\n平底鍋\n煎鍋"
                ),
                temperature=0.1,
                max_output_tokens=100,
            ),
        )
        track_gemini_usage(response, model=model, user_id=user_id)

        text = response.text.strip()
        logger.warning(f"關鍵字提取原始回應: {repr(text)}")  # warning 級別確保 Cloud Run 可見

        # 解析：先按換行分割
        raw_lines = [kw.strip() for kw in text.split("\n") if kw.strip()]

        # 清除編號前綴（1. 2. 3. 或 - * •）
        keywords = []
        for line in raw_lines:
            cleaned = re.sub(r'^[\d]+[.、)）]\s*', '', line)
            cleaned = re.sub(r'^[-*•]\s*', '', cleaned)
            cleaned = cleaned.strip()
            if cleaned:
                keywords.append(cleaned)

        # 如果只解析出 1 個且包含逗號/頓號/空格，嘗試再分割
        if len(keywords) == 1:
            if any(sep in keywords[0] for sep in [',', '，', '、', ' ']):
                parts = re.split(r'[,，、\s]+', keywords[0])
                keywords = [p.strip() for p in parts if len(p.strip()) >= 2]

        if keywords:
            keywords = _extend_keyword_fragments(keywords[:3], product_name)

        # 不足 3 個時用 fallback 補足
        if len(keywords) < 3:
            fallback_kws = _fallback_extract_keywords(product_name)
            seen = set(keywords)
            for fkw in fallback_kws:
                if fkw not in seen and len(keywords) < 3:
                    seen.add(fkw)
                    keywords.append(fkw)

        logger.warning(f"關鍵字提取最終結果: {keywords}")
        if keywords:
            return keywords
    except Exception as e:
        logger.warning(f"關鍵字提取失敗: {e}")

    # Fallback：從商品名智能提取關鍵字
    fallback = _fallback_extract_keywords(product_name)
    logger.warning(f"關鍵字提取 fallback: {fallback}")
    return fallback


def _strip_emoji(text: str) -> str:
    """移除 emoji 字元"""
    return re.sub(
        r'[\U0001F300-\U0001F9FF\U00002600-\U000027BF\U0000FE00-\U0000FEFF'
        r'\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF\U00002702-\U000027B0'
        r'\U0000200D\U0000FE0F]+', '', text
    )


# 常見促銷/平台垃圾詞（不是產品品類）
_JUNK_WORDS = {
    '隔日到貨', '隔日配', '現貨', '現貨秒發', '台灣出貨', '台灣現貨',
    '免運', '特惠免運', '蝦皮直營', '蝦皮獨家', '蝦皮限定', '桃園有貨', '新貨', '秒發',
    '台灣製造', '超值', '熱銷', '爆款', '批發', '箱購', '盒裝',
    '限時', '特價', '優惠', '促銷', '出清', '獨家', '限定',
}


def _fallback_extract_keywords(product_name: str) -> list[str]:
    """LLM 失敗時的 fallback：從商品名智能提取關鍵字"""
    # 1. 移除 emoji
    cleaned = _strip_emoji(product_name)
    # 2. 移除促銷/平台詞彙
    for junk in _JUNK_WORDS:
        cleaned = cleaned.replace(junk, ' ')
    # 3. 按分隔符號拆分
    terms = re.split(r'[/\s,、|｜()（）\[\]【】*➤]+', cleaned)
    # 過濾：2-8 字、排除純數字/規格（如 300ml、6入、500g）
    terms = [
        t.strip() for t in terms
        if 2 <= len(t.strip()) <= 8
        and re.search(r'[\u4e00-\u9fff]', t.strip())  # 必須含中文字
        and not re.search(r'\d+(ml|g|kg|入|包|片|顆|個|cm|mm)', t.strip(), re.IGNORECASE)  # 排除規格
    ]
    # 4. 去重，保持順序
    seen = set()
    unique = []
    for t in terms:
        if t not in seen:
            seen.add(t)
            unique.append(t)
    # 5. 按長度降序排列（較長的詞通常更精確）
    unique.sort(key=len, reverse=True)
    return unique[:3] if unique else [product_name[:10]]


def _extend_keyword_fragments(keywords: list[str], product_name: str) -> list[str]:
    """後處理：如果關鍵字是商品名中某個完整詞的片段，自動補全

    例如：「螢幕增」→ 在商品名找到「螢幕增高架」→ 補全為「螢幕增高架」
    """
    # 把商品名拆成獨立詞彙
    terms = re.split(r'[/\s,、|｜()（）\[\]【】*➤💖🔥✨📌❤️]+', product_name)
    terms = [t.strip() for t in terms if len(t.strip()) >= 3]

    validated = []
    seen = set()
    for kw in keywords:
        extended = kw
        # 檢查關鍵字是否為某個商品名詞彙的子字串片段
        # 例：「嬰兒紙」在「好奇小森林嬰兒紙尿褲」中 → 補全為「嬰兒紙尿褲」
        for term in sorted(terms, key=len):  # 從短到長，取最精確的匹配
            idx = term.find(kw)
            if idx >= 0 and len(term) > len(kw):
                # 從關鍵字位置截取到詞彙結尾
                candidate = term[idx:]
                if len(candidate) <= 8:
                    extended = candidate
                    break
        if extended not in seen:
            seen.add(extended)
            validated.append(extended)

    return validated if validated else keywords


def calculate_competitor_score(
    item: dict, source_price: float = None, keywords: list[str] = None
) -> float:
    """計算競品分數（0-100）

    權重分配：銷量 25% + 評分 20% + 佣金 20% + 價格相似度 15% + 關鍵字相關性 20%
    """
    sales = item.get("_sales") or 0
    rating = item.get("_rating") or 0
    comm_pct = item.get("_commissionPct") or 0
    price = item.get("_price") or 0

    # 銷量 25%：log10 映射（0-5 對應 0-100）
    sales_score = min((math.log10(sales + 1) / 5) * 100, 100) * 0.25

    # 評分 20%：3.5-5.0 映射
    rating_clamped = max(rating - 3.5, 0)
    rating_score = min((rating_clamped / 1.5) * 100, 100) * 0.20

    # 佣金率 20%：0-30% 映射
    comm_score = min((comm_pct / 30) * 100, 100) * 0.20

    # 價格相似度 15%
    price_score = 0
    if source_price and source_price > 0 and price > 0:
        price_score = (min(source_price, price) / max(source_price, price)) * 100 * 0.15
    else:
        price_score = 50 * 0.15  # 無法比較時給 50 分

    # 關鍵字相關性 20%：商品名是否包含搜尋關鍵字
    relevance_score = 0
    if keywords:
        item_name = item.get("productName") or ""
        match_count = sum(1 for kw in keywords if kw in item_name)
        if match_count > 0:
            # 1 個匹配 = 50 分，2+ 個 = 100 分
            relevance_score = min((match_count / len(keywords)) * 150, 100) * 0.20
    else:
        relevance_score = 50 * 0.20  # 無法比較時給 50 分

    return round(
        sales_score + rating_score + comm_score + price_score + relevance_score, 1
    )
