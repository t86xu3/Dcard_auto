"""
API 使用量統計路由
"""
from fastapi import APIRouter, Depends
from app.services.usage_tracker import usage_tracker
from app.models.user import User
from app.auth import get_current_user

router = APIRouter()


@router.get("")
async def get_usage(current_user: User = Depends(get_current_user)):
    """取得當前用戶的 API 使用量統計"""
    return usage_tracker.get_usage(user_id=current_user.id)
