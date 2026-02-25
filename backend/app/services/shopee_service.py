"""
蝦皮聯盟行銷 API 服務
GraphQL API + SHA256 簽名認證
"""
import hashlib
import json
import logging
import time

import requests

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
        limit: int = 100,
        min_commission_rate: float = None,
        min_sales: int = None,
        max_sales: int = None,
        min_price: float = None,
        max_price: float = None,
        min_rating: float = None,
    ) -> dict:
        """彈性查詢商品，支援後端過濾"""
        # 組建 GraphQL 變數與參數宣告
        var_defs = ["$limit: Int", "$page: Int", "$sortType: Int", "$listType: Int"]
        args = ["limit: $limit", "page: $page", "sortType: $sortType", "listType: $listType"]
        variables = {
            "limit": limit,
            "page": page,
            "sortType": sort_type,
            "listType": list_type,
        }

        if keyword:
            var_defs.append("$keyword: String")
            args.append("keyword: $keyword")
            variables["keyword"] = keyword
        if is_ams_offer is not None:
            var_defs.append("$isAmsOffer: Boolean")
            args.append("isAmsOffer: $isAmsOffer")
            variables["isAmsOffer"] = is_ams_offer
        if is_key_seller is not None:
            var_defs.append("$isKeySeller: Boolean")
            args.append("isKeySeller: $isKeySeller")
            variables["isKeySeller"] = is_key_seller

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

        data = self._request(query, variables)
        result = data.get("productOfferV2", {})
        nodes = result.get("nodes", [])
        page_info = result.get("pageInfo", {})
        total_before_filter = len(nodes)

        # 型別轉換 + 後端過濾
        filtered = []
        for item in nodes:
            # String → float 轉換
            try:
                cr = float(item.get("commissionRate") or 0)
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
            # commissionRate 是小數（0.9 = 90%），用戶輸入百分比（5 = 5%）
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

            filtered.append(item)

        return {
            "items": filtered,
            "total_before_filter": total_before_filter,
            "total_after_filter": len(filtered),
            "page_info": page_info,
        }


shopee_service = ShopeeService()
