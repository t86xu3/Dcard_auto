"""
API 使用量統計路由
"""
from fastapi import APIRouter
from app.services.usage_tracker import usage_tracker

router = APIRouter()


@router.get("")
async def get_usage():
    """取得 API 使用量統計（按模型分組 + 30 天歷史 + 費用）"""
    return usage_tracker.get_usage()
