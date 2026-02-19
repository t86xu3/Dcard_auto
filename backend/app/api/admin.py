"""
管理員 API 路由 — 用戶管理、核准/停用
"""
from typing import List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.user import User
from app.auth import get_current_admin

router = APIRouter()


class AdminUserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    is_admin: bool
    is_approved: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/users", response_model=List[AdminUserResponse])
async def list_users(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """列出所有用戶（僅管理員）"""
    users = db.query(User).order_by(User.created_at).all()
    return users


@router.post("/users/{user_id}/approve")
async def approve_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """核准用戶使用 LLM（僅管理員）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用戶不存在")

    user.is_approved = True
    db.commit()
    return {"message": f"已核准用戶 {user.username}"}


@router.post("/users/{user_id}/revoke")
async def revoke_user(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """撤銷用戶 LLM 權限（僅管理員）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用戶不存在")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="不能撤銷管理員權限")

    user.is_approved = False
    db.commit()
    return {"message": f"已撤銷用戶 {user.username} 的 LLM 權限"}


@router.post("/users/{user_id}/toggle-active")
async def toggle_user_active(
    user_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """啟用/停用用戶帳號（僅管理員）"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="用戶不存在")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="不能停用管理員帳號")

    user.is_active = not user.is_active
    db.commit()
    status = "啟用" if user.is_active else "停用"
    return {"message": f"已{status}用戶 {user.username}"}
