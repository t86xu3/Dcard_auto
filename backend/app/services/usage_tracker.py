"""
API 使用量追蹤服務
"""
from datetime import date
from typing import Dict
import logging

from app.db.database import SessionLocal
from app.models.api_usage import ApiUsage

logger = logging.getLogger(__name__)


class UsageTracker:
    """API 使用量追蹤器"""

    FREE_TIER_DAILY_REQUESTS = 1000
    FREE_TIER_DAILY_TOKENS = 250000

    def _get_or_create_today(self, db) -> ApiUsage:
        today = date.today()
        usage = db.query(ApiUsage).filter(ApiUsage.usage_date == today).first()
        if not usage:
            usage = ApiUsage(usage_date=today)
            db.add(usage)
            db.commit()
            db.refresh(usage)
        return usage

    def record_usage(self, input_tokens: int, output_tokens: int):
        """記錄一次 API 使用"""
        db = SessionLocal()
        try:
            usage = self._get_or_create_today(db)
            usage.requests += 1
            usage.input_tokens += input_tokens
            usage.output_tokens += output_tokens
            db.commit()
        except Exception as e:
            logger.error(f"記錄使用量失敗: {e}")
            db.rollback()
        finally:
            db.close()

    def get_usage(self) -> Dict:
        """取得當日使用統計"""
        db = SessionLocal()
        try:
            usage = self._get_or_create_today(db)
            total_tokens = usage.input_tokens + usage.output_tokens

            return {
                "date": usage.usage_date.isoformat(),
                "requests": {
                    "used": usage.requests,
                    "limit": self.FREE_TIER_DAILY_REQUESTS,
                    "remaining": max(0, self.FREE_TIER_DAILY_REQUESTS - usage.requests),
                    "percentage": round(usage.requests / self.FREE_TIER_DAILY_REQUESTS * 100, 1),
                },
                "tokens": {
                    "input": usage.input_tokens,
                    "output": usage.output_tokens,
                    "total": total_tokens,
                    "limit": self.FREE_TIER_DAILY_TOKENS,
                    "remaining": max(0, self.FREE_TIER_DAILY_TOKENS - total_tokens),
                    "percentage": round(total_tokens / self.FREE_TIER_DAILY_TOKENS * 100, 1),
                },
                "recent_history": self._get_recent_history(db),
            }
        finally:
            db.close()

    def _get_recent_history(self, db) -> list:
        records = db.query(ApiUsage).order_by(ApiUsage.usage_date.desc()).limit(7).all()
        return [
            {
                "date": r.usage_date.isoformat(),
                "requests": r.requests,
                "input_tokens": r.input_tokens,
                "output_tokens": r.output_tokens,
            }
            for r in records
        ]

    def estimate_cost(self) -> Dict:
        """估算費用"""
        db = SessionLocal()
        try:
            usage = self._get_or_create_today(db)
            INPUT_PRICE_PER_M = 0.30
            OUTPUT_PRICE_PER_M = 2.50

            input_cost = (usage.input_tokens / 1_000_000) * INPUT_PRICE_PER_M
            output_cost = (usage.output_tokens / 1_000_000) * OUTPUT_PRICE_PER_M
            total_cost = input_cost + output_cost

            return {
                "input_cost_usd": round(input_cost, 4),
                "output_cost_usd": round(output_cost, 4),
                "total_cost_usd": round(total_cost, 4),
                "total_cost_twd": round(total_cost * 32, 2),
                "note": "免費額度內不收費",
            }
        finally:
            db.close()


usage_tracker = UsageTracker()
