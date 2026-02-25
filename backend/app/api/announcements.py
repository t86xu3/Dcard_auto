"""
公告 API 路由 — 公告 CRUD + 啟用/停用
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.announcement import Announcement
from app.models.user import User
from app.auth import get_current_user, get_current_admin

router = APIRouter()


# === Pydantic Schemas ===

class AnnouncementCreate(BaseModel):
    title: str
    content: str


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    is_active: Optional[bool] = None


class AnnouncementResponse(BaseModel):
    id: int
    title: str
    content: str
    is_active: bool
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# === 一般用戶端點 ===

@router.get("", response_model=List[AnnouncementResponse])
async def get_announcements(
    db: Session = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """取得啟用中的公告（所有登入用戶）"""
    return (
        db.query(Announcement)
        .filter(Announcement.is_active == True)
        .order_by(Announcement.created_at.desc())
        .all()
    )


# === 管理員端點 ===

@router.get("/admin", response_model=List[AnnouncementResponse])
async def get_all_announcements(
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """取得所有公告（含停用，僅管理員）"""
    return (
        db.query(Announcement)
        .order_by(Announcement.created_at.desc())
        .all()
    )


@router.post("", response_model=AnnouncementResponse)
async def create_announcement(
    data: AnnouncementCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_current_admin),
):
    """新增公告（僅管理員）"""
    announcement = Announcement(
        title=data.title,
        content=data.content,
        created_by=admin.id,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return announcement


@router.put("/{announcement_id}", response_model=AnnouncementResponse)
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """編輯公告（僅管理員）"""
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")

    if data.title is not None:
        announcement.title = data.title
    if data.content is not None:
        announcement.content = data.content
    if data.is_active is not None:
        announcement.is_active = data.is_active

    db.commit()
    db.refresh(announcement)
    return announcement


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """刪除公告（僅管理員）"""
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")

    db.delete(announcement)
    db.commit()
    return {"message": "公告已刪除"}


@router.post("/{announcement_id}/toggle")
async def toggle_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    _admin: User = Depends(get_current_admin),
):
    """切換公告啟用/停用（僅管理員）"""
    announcement = db.query(Announcement).filter(Announcement.id == announcement_id).first()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")

    announcement.is_active = not announcement.is_active
    db.commit()
    status = "啟用" if announcement.is_active else "停用"
    return {"message": f"公告已{status}", "is_active": announcement.is_active}
