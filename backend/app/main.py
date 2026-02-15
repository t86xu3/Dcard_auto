"""
Dcard 自動文章生成系統 - FastAPI 後端
"""
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.database import create_tables, SessionLocal
from app.api import products, articles, seo, usage, prompts


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    create_tables()
    settings.IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Seed 內建 prompt 範本
    from app.services.prompts import seed_default_prompts
    db = SessionLocal()
    try:
        seed_default_prompts(db)
    finally:
        db.close()

    yield


app = FastAPI(
    title="Dcard 自動文章生成系統",
    description="蝦皮商品擷取 → LLM 生成文章 → SEO 優化 → Dcard 發佈",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 靜態檔案（圖片）
images_dir = Path("./images")
images_dir.mkdir(parents=True, exist_ok=True)
app.mount("/images", StaticFiles(directory=str(images_dir)), name="images")

# 註冊路由
app.include_router(products.router, prefix="/api/products", tags=["商品管理"])
app.include_router(articles.router, prefix="/api/articles", tags=["文章管理"])
app.include_router(seo.router, prefix="/api/seo", tags=["SEO 分析"])
app.include_router(usage.router, prefix="/api/usage", tags=["使用量統計"])
app.include_router(prompts.router, prefix="/api/prompts", tags=["Prompt 範本"])


@app.get("/")
async def root():
    """健康檢查"""
    return {"status": "ok", "message": "Dcard 自動文章生成系統 API"}


@app.get("/health")
async def health_check():
    """健康檢查端點"""
    return {"status": "healthy"}
