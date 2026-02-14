"""
API 使用量統計路由
"""
from fastapi import APIRouter
from app.services.usage_tracker import usage_tracker

router = APIRouter()


@router.get("")
async def get_usage():
    """取得當日 API 使用量統計"""
    usage = usage_tracker.get_usage()
    cost = usage_tracker.estimate_cost()
    return {**usage, "cost": cost}
