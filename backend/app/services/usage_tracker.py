"""
API 使用量追蹤服務（可擴充多供應商/多模型）
"""
from datetime import date, timedelta
from typing import Dict, List, Optional
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
        "gemini-3-pro-preview": {"input": 2.00, "output": 12.00},
    },
    "anthropic": {
        "claude-sonnet-4-5":  {"input": 3.00, "output": 15.00},
        "claude-haiku-4-5":   {"input": 1.00, "output": 5.00},
    },
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

    def get_usage(self, user_id: Optional[int] = None) -> Dict:
        """取得完整使用統計（按模型分組 + 30 天歷史），可按 user_id 過濾"""
        db = SessionLocal()
        try:
            # 按模型分組的累計統計
            by_model = []
            total_cost_usd = 0.0

            base_query = db.query(
                UsageRecord.provider,
                UsageRecord.model,
                func.sum(UsageRecord.requests).label("requests"),
                func.sum(UsageRecord.input_tokens).label("input_tokens"),
                func.sum(UsageRecord.output_tokens).label("output_tokens"),
            )
            if user_id is not None:
                base_query = base_query.filter(UsageRecord.user_id == user_id)

            model_stats = base_query.group_by(UsageRecord.provider, UsageRecord.model).all()

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
            history_query = db.query(
                UsageRecord.usage_date,
                UsageRecord.provider,
                UsageRecord.model,
                UsageRecord.requests,
                UsageRecord.input_tokens,
                UsageRecord.output_tokens,
            ).filter(UsageRecord.usage_date >= thirty_days_ago)
            if user_id is not None:
                history_query = history_query.filter(UsageRecord.user_id == user_id)

            daily_records = history_query.order_by(UsageRecord.usage_date.desc()).all()

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


    def get_all_users_usage(self, db_session=None) -> Dict:
        """管理員用：取得所有用戶的費用總覽"""
        from app.models.user import User

        db = db_session or SessionLocal()
        try:
            # 全站總計（復用 get_usage 不帶 user_id）
            global_stats = self.get_usage(user_id=None)

            # 按用戶分組統計
            user_stats_raw = db.query(
                UsageRecord.user_id,
                func.sum(UsageRecord.requests).label("requests"),
                func.sum(UsageRecord.input_tokens).label("input_tokens"),
                func.sum(UsageRecord.output_tokens).label("output_tokens"),
            ).group_by(UsageRecord.user_id).all()

            # 取得用戶名對照
            user_ids = [r.user_id for r in user_stats_raw if r.user_id is not None]
            users_map = {}
            if user_ids:
                users = db.query(User.id, User.username).filter(User.id.in_(user_ids)).all()
                users_map = {u.id: u.username for u in users}

            # 每用戶的模型明細
            per_user_model = db.query(
                UsageRecord.user_id,
                UsageRecord.provider,
                UsageRecord.model,
                func.sum(UsageRecord.requests).label("requests"),
                func.sum(UsageRecord.input_tokens).label("input_tokens"),
                func.sum(UsageRecord.output_tokens).label("output_tokens"),
            ).group_by(UsageRecord.user_id, UsageRecord.provider, UsageRecord.model).all()

            # 組裝每用戶資料
            by_user = {}
            for row in per_user_model:
                uid = row.user_id or 0
                if uid not in by_user:
                    by_user[uid] = {
                        "user_id": row.user_id,
                        "username": users_map.get(row.user_id, "未知"),
                        "models": [],
                        "total_cost_usd": 0.0,
                    }
                cost = self._calc_cost(row.provider, row.model, row.input_tokens, row.output_tokens)
                by_user[uid]["models"].append({
                    "provider": row.provider,
                    "model": row.model,
                    "requests": row.requests,
                    "input_tokens": row.input_tokens,
                    "output_tokens": row.output_tokens,
                    "cost_usd": round(cost, 6),
                })
                by_user[uid]["total_cost_usd"] = round(by_user[uid]["total_cost_usd"] + cost, 6)

            users_list = sorted(by_user.values(), key=lambda x: x["total_cost_usd"], reverse=True)
            for u in users_list:
                u["total_cost_twd"] = round(u["total_cost_usd"] * USD_TO_TWD, 2)

            return {
                **global_stats,
                "by_user": users_list,
            }
        finally:
            if not db_session:
                db.close()


usage_tracker = UsageTracker()
