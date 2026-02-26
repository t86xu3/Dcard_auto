"""
蝦皮聯盟行銷 API 服務
GraphQL API + SHA256 簽名認證
"""
import hashlib
import json
import logging
import math
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
        max_pages = 5  # 安全上限，避免無限迴圈
        seen_ids = set()  # 去重

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

                # 過濾
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
                    "你是蝦皮商品搜尋關鍵字提取器。從商品名稱中提取恰好 3 個搜尋關鍵字，用於找同類競品。\n"
                    "規則：\n"
                    "- 第一個關鍵字：材質/特性 + 核心產品名，例如「陶瓷保溫杯」「無線藍牙耳機」「胺基酸洗面乳」\n"
                    "- 第二個關鍵字：核心產品名或同義詞，例如「保溫瓶」「耳機」「洗面乳」\n"
                    "- 第三個關鍵字：商品名中的替代品類詞（斜線/分隔符號後的詞），例如「隨行杯」「耳塞」\n"
                    "- 每個關鍵字必須 2-5 個中文字，包含產品品類名詞\n"
                    "- 禁止輸出：品牌名、型號編號、emoji、促銷文案、容量/尺寸數字、單獨修飾詞（如「質感」「智慧」）\n"
                    "- 每行一個關鍵字，不要編號，不要其他文字\n"
                    "範例1：\n"
                    "輸入：【未來實驗室】Midizon 衛浴殺菌除濕機 活氧 去異味\n"
                    "輸出：\n殺菌除濕機\n除濕機\n衛浴除濕機\n"
                    "範例2：\n"
                    "輸入：Twinko💖[HM231]➤獨家自訂款系列*質感陶瓷內層保溫杯735ml/保溫瓶/陶瓷保溫/隨行杯\n"
                    "輸出：\n陶瓷保溫杯\n保溫瓶\n隨行杯"
                ),
                temperature=0.1,
                max_output_tokens=100,
            ),
        )
        track_gemini_usage(response, model=model, user_id=user_id)

        text = response.text.strip()
        keywords = [kw.strip() for kw in text.split("\n") if kw.strip()]
        if keywords:
            return keywords[:3]
    except Exception as e:
        logger.warning(f"關鍵字提取失敗: {e}")

    # Fallback：截取商品名前 10 字
    return [product_name[:10]]


def calculate_competitor_score(item: dict, source_price: float = None) -> float:
    """計算競品分數（0-100）"""
    sales = item.get("_sales") or 0
    rating = item.get("_rating") or 0
    comm_pct = item.get("_commissionPct") or 0
    price = item.get("_price") or 0

    # 銷量 30%：log10 映射（0-5 對應 0-100）
    sales_score = min((math.log10(sales + 1) / 5) * 100, 100) * 0.3

    # 評分 25%：3.5-5.0 映射
    rating_clamped = max(rating - 3.5, 0)
    rating_score = min((rating_clamped / 1.5) * 100, 100) * 0.25

    # 佣金率 25%：0-30% 映射
    comm_score = min((comm_pct / 30) * 100, 100) * 0.25

    # 價格相似度 20%
    price_score = 0
    if source_price and source_price > 0 and price > 0:
        price_score = (min(source_price, price) / max(source_price, price)) * 100 * 0.2
    else:
        price_score = 50 * 0.2  # 無法比較時給 50 分

    return round(sales_score + rating_score + comm_score + price_score, 1)
