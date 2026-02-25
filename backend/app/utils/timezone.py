"""
台灣時區工具（集中管理，避免各 model 重複定義）
"""
from datetime import datetime, timezone, timedelta, date

TAIPEI_TZ = timezone(timedelta(hours=8))


def taipei_now() -> datetime:
    """取得台灣當前時間（timezone-aware）"""
    return datetime.now(TAIPEI_TZ)


def taipei_today() -> date:
    """取得台灣當前日期（UTC+8 校正）"""
    return datetime.now(TAIPEI_TZ).date()
