"""
Prompt 範本 API 路由
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import or_

from app.db.database import get_db
from app.models.prompt_template import PromptTemplate
from app.models.user import User
from app.auth import get_current_user

router = APIRouter()


# Pydantic Schemas
class PromptTemplateCreate(BaseModel):
    name: str
    content: str


class PromptTemplateUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[str] = None


class PromptTemplateResponse(BaseModel):
    id: int
    name: str
    content: str
    is_default: bool
    is_builtin: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


@router.get("", response_model=List[PromptTemplateResponse])
async def list_prompts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """列出全局內建範本 + 自己建的範本"""
    templates = (
        db.query(PromptTemplate)
        .filter(
            or_(
                PromptTemplate.is_builtin == True,
                PromptTemplate.user_id == current_user.id,
            )
        )
        .order_by(PromptTemplate.is_default.desc(), PromptTemplate.created_at)
        .all()
    )
    return templates


@router.post("", response_model=PromptTemplateResponse)
async def create_prompt(
    request: PromptTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """新增範本"""
    template = PromptTemplate(
        name=request.name,
        content=request.content,
        is_default=False,
        is_builtin=False,
        user_id=current_user.id,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/{prompt_id}", response_model=PromptTemplateResponse)
async def update_prompt(
    prompt_id: int,
    request: PromptTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新範本"""
    template = db.query(PromptTemplate).filter(PromptTemplate.id == prompt_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="範本不存在")
    if not template.is_builtin and template.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="無權修改此範本")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{prompt_id}")
async def delete_prompt(
    prompt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """刪除範本"""
    template = db.query(PromptTemplate).filter(PromptTemplate.id == prompt_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="範本不存在")
    if not template.is_builtin and template.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="無權刪除此範本")

    # 若刪除的是預設範本，將內建範本設為預設
    if template.is_default:
        builtin = db.query(PromptTemplate).filter(PromptTemplate.is_builtin == True).first()
        if builtin:
            builtin.is_default = True

    db.delete(template)
    db.commit()
    return {"message": "範本已刪除"}


@router.post("/{prompt_id}/set-default", response_model=PromptTemplateResponse)
async def set_default_prompt(
    prompt_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """設為預設範本"""
    template = db.query(PromptTemplate).filter(PromptTemplate.id == prompt_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="範本不存在")

    # 取消其他範本的預設狀態
    db.query(PromptTemplate).filter(PromptTemplate.is_default == True).update({"is_default": False})

    template.is_default = True
    db.commit()
    db.refresh(template)
    return template
