"""
Prompt 範本 API 路由
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.models.prompt_template import PromptTemplate

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
async def list_prompts(db: Session = Depends(get_db)):
    """列出所有範本"""
    templates = db.query(PromptTemplate).order_by(PromptTemplate.is_default.desc(), PromptTemplate.created_at).all()
    return templates


@router.post("", response_model=PromptTemplateResponse)
async def create_prompt(request: PromptTemplateCreate, db: Session = Depends(get_db)):
    """新增範本"""
    template = PromptTemplate(
        name=request.name,
        content=request.content,
        is_default=False,
        is_builtin=False,
    )
    db.add(template)
    db.commit()
    db.refresh(template)
    return template


@router.put("/{prompt_id}", response_model=PromptTemplateResponse)
async def update_prompt(prompt_id: int, request: PromptTemplateUpdate, db: Session = Depends(get_db)):
    """更新範本"""
    template = db.query(PromptTemplate).filter(PromptTemplate.id == prompt_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="範本不存在")

    update_data = request.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(template, key, value)

    db.commit()
    db.refresh(template)
    return template


@router.delete("/{prompt_id}")
async def delete_prompt(prompt_id: int, db: Session = Depends(get_db)):
    """刪除範本（內建不可刪）"""
    template = db.query(PromptTemplate).filter(PromptTemplate.id == prompt_id).first()
    if not template:
        raise HTTPException(status_code=404, detail="範本不存在")
    if template.is_builtin:
        raise HTTPException(status_code=400, detail="內建範本不可刪除")

    # 若刪除的是預設範本，將內建範本設為預設
    if template.is_default:
        builtin = db.query(PromptTemplate).filter(PromptTemplate.is_builtin == True).first()
        if builtin:
            builtin.is_default = True

    db.delete(template)
    db.commit()
    return {"message": "範本已刪除"}


@router.post("/{prompt_id}/set-default", response_model=PromptTemplateResponse)
async def set_default_prompt(prompt_id: int, db: Session = Depends(get_db)):
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
