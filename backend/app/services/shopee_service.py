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


shopee_service = ShopeeService()
