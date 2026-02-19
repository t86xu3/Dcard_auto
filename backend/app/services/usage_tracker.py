"""
API 使用量追蹤服務（可擴充多供應商/多模型）
"""
from datetime import date, timedelta
from typing import Dict, Optional
import logging

from sqlalchemy import func

from app.db.database import SessionLocal
from app.models.usage_record import UsageRecord

logger = logging.getLogger(__name__)

# 每百萬 token 的 USD 價格
MODEL_PRICING = {
    "google": {
        "gemini-2.5-flash": {"input": 0.15, "output": 0.60},
        "gemini-2.5-pro":   {"input": 1.25, "output": 10.00},
    },
    # 未來擴充：
    # "openai": {
    #     "gpt-4o": {"input": 2.50, "output": 10.00},
    # },
}

USD_TO_TWD = 32.5


class UsageTracker:
    """API 使用量追蹤器（多供應商/多模型）"""

    def _get_or_create_record(self, db, provider: str, model: str, user_id: Optional[int] = None) -> UsageRecord:
        today = date.today()
        query = db.query(UsageRecord).filter(
            UsageRecord.provider == provider,
            UsageRecord.model == model,
            UsageRecord.usage_date == today,
        )
        if user_id is not None:
            query = query.filter(UsageRecord.user_id == user_id)
        else:
            query = query.filter(UsageRecord.user_id.is_(None))

        record = query.first()
        if not record:
            record = UsageRecord(
                provider=provider,
                model=model,
                user_id=user_id,
                usage_date=today,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
        return record

    def record_usage(self, provider: str, model: str, input_tokens: int, output_tokens: int, user_id: Optional[int] = None):
        """記錄一次 API 使用"""
        db = SessionLocal()
        try:
            record = self._get_or_create_record(db, provider, model, user_id)
            record.requests += 1
            record.input_tokens += input_tokens
            record.output_tokens += output_tokens
            db.commit()
        except Exception as e:
            logger.error(f"記錄使用量失敗: {e}")
            db.rollback()
        finally:
            db.close()

    def _calc_cost(self, provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
        pricing = MODEL_PRICING.get(provider, {}).get(model)
        if not pricing:
            return 0.0
        input_cost = (input_tokens / 1_000_000) * pricing["input"]
        output_cost = (output_tokens / 1_000_000) * pricing["output"]
        return input_cost + output_cost

    def get_usage(self) -> Dict:
        """取得完整使用統計（按模型分組 + 30 天歷史）"""
        db = SessionLocal()
        try:
            # 按模型分組的累計統計
            by_model = []
            total_cost_usd = 0.0

            model_stats = (
                db.query(
                    UsageRecord.provider,
                    UsageRecord.model,
                    func.sum(UsageRecord.requests).label("requests"),
                    func.sum(UsageRecord.input_tokens).label("input_tokens"),
                    func.sum(UsageRecord.output_tokens).label("output_tokens"),
                )
                .group_by(UsageRecord.provider, UsageRecord.model)
                .all()
            )

            for stat in model_stats:
                cost = self._calc_cost(stat.provider, stat.model, stat.input_tokens, stat.output_tokens)
                total_cost_usd += cost
                by_model.append({
                    "provider": stat.provider,
                    "model": stat.model,
                    "requests": stat.requests,
                    "input_tokens": stat.input_tokens,
                    "output_tokens": stat.output_tokens,
                    "cost_usd": round(cost, 6),
                })

            # 30 天每日歷史
            thirty_days_ago = date.today() - timedelta(days=30)
            daily_records = (
                db.query(
                    UsageRecord.usage_date,
                    UsageRecord.provider,
                    UsageRecord.model,
                    UsageRecord.requests,
                    UsageRecord.input_tokens,
                    UsageRecord.output_tokens,
                )
                .filter(UsageRecord.usage_date >= thirty_days_ago)
                .order_by(UsageRecord.usage_date.desc())
                .all()
            )

            # 按日期聚合
            history_map = {}
            for rec in daily_records:
                d = rec.usage_date.isoformat()
                if d not in history_map:
                    history_map[d] = {"date": d, "models": {}, "daily_total_usd": 0.0}
                model_key = f"{rec.provider}/{rec.model}"
                cost = self._calc_cost(rec.provider, rec.model, rec.input_tokens, rec.output_tokens)
                history_map[d]["models"][model_key] = {
                    "requests": rec.requests,
                    "input_tokens": rec.input_tokens,
                    "output_tokens": rec.output_tokens,
                    "cost_usd": round(cost, 6),
                }
                history_map[d]["daily_total_usd"] = round(history_map[d]["daily_total_usd"] + cost, 6)

            history = sorted(history_map.values(), key=lambda x: x["date"], reverse=True)

            return {
                "by_model": by_model,
                "total_cost_usd": round(total_cost_usd, 6),
                "total_cost_twd": round(total_cost_usd * USD_TO_TWD, 2),
                "history": history,
                "pricing": MODEL_PRICING,
            }
        finally:
            db.close()


usage_tracker = UsageTracker()
