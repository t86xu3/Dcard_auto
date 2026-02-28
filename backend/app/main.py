"""
Dcard 自動文章生成系統 - FastAPI 後端
"""
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import event, DateTime
from sqlalchemy.orm.attributes import set_committed_value

from app.config import settings
from app.utils.timezone import TAIPEI_TZ, taipei_now
from app.db.database import Base, create_tables, SessionLocal, engine
from app.api import products, articles, seo, usage, prompts, shopee, announcements, keywords
from app.api import auth as auth_api
from app.api import admin as admin_api


# === 全域 DateTime 時區修正 ===
# SQLite / PostgreSQL(TIMESTAMP WITHOUT TIME ZONE) 讀取的 datetime 無時區，
# 透過 ORM 事件在載入時自動補上 Asia/Taipei (+08:00)

def _ensure_datetime_tz(instance):
    """確保所有 DateTime 屬性帶有時區資訊"""
    for col in instance.__class__.__table__.columns:
        if isinstance(col.type, DateTime):
            val = getattr(instance, col.name, None)
            if isinstance(val, datetime) and val.tzinfo is None:
                set_committed_value(instance, col.name, val.replace(tzinfo=TAIPEI_TZ))


@event.listens_for(Base, "load", propagate=True)
def _on_load(instance, context):
    _ensure_datetime_tz(instance)


@event.listens_for(Base, "refresh", propagate=True)
def _on_refresh(instance, context, attrs):
    _ensure_datetime_tz(instance)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """應用程式生命週期管理"""
    create_tables()

    # 本地開發時才建立圖片目錄
    if not settings.is_production:
        settings.IMAGES_DIR.mkdir(parents=True, exist_ok=True)

    # Seed 內建 prompt 範本
    from app.services.prompts import seed_default_prompts
    db = SessionLocal()
    try:
        seed_default_prompts(db)
    finally:
        db.close()

    # 建立初始管理員帳號
    _seed_admin_user()

    # 預熱 DB 連線（減少首次請求延遲）
    import logging
    logger = logging.getLogger(__name__)
    try:
        from sqlalchemy import text
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("DB 連線預熱完成")
    except Exception as e:
        logger.warning(f"DB 預熱失敗: {e}")

    yield


app = FastAPI(
    title="Dcard 自動文章生成系統",
    description="蝦皮商品擷取 → LLM 生成文章 → SEO 優化 → Dcard 發佈",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS 設定（生產環境限制來源）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 靜態檔案（圖片）- 僅本地開發時掛載
if not settings.is_production:
    images_dir = settings.IMAGES_DIR
    images_dir.mkdir(parents=True, exist_ok=True)
    app.mount("/images", StaticFiles(directory=str(images_dir)), name="images")

# 註冊路由
app.include_router(auth_api.router, prefix="/api/auth", tags=["認證"])
app.include_router(admin_api.router, prefix="/api/admin", tags=["管理員"])
app.include_router(products.router, prefix="/api/products", tags=["商品管理"])
app.include_router(articles.router, prefix="/api/articles", tags=["文章管理"])
app.include_router(seo.router, prefix="/api/seo", tags=["SEO 分析"])
app.include_router(usage.router, prefix="/api/usage", tags=["使用量統計"])
app.include_router(prompts.router, prefix="/api/prompts", tags=["Prompt 範本"])
app.include_router(shopee.router, prefix="/api/shopee", tags=["蝦皮聯盟"])
app.include_router(announcements.router, prefix="/api/announcements", tags=["公告"])
app.include_router(keywords.router, prefix="/api/keywords", tags=["關鍵字研究"])


def _seed_admin_user():
    """啟動時建立初始管理員帳號（若不存在）"""
    import logging
    from app.models.user import User
    from app.auth import get_password_hash

    logger = logging.getLogger(__name__)

    if not settings.ADMIN_PASSWORD:
        logger.warning("未設定 ADMIN_PASSWORD 環境變數，跳過管理員帳號建立")
        return

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.username == settings.ADMIN_USERNAME).first()
        if not existing:
            admin = User(
                username=settings.ADMIN_USERNAME,
                email=settings.ADMIN_EMAIL,
                hashed_password=get_password_hash(settings.ADMIN_PASSWORD),
                is_active=True,
                is_admin=True,
                is_approved=True,
            )
            db.add(admin)
            db.commit()
            logger.info(f"已建立初始管理員帳號: {settings.ADMIN_USERNAME}")
        else:
            # 修補 migration 建立的帳號缺少 created_at 的問題
            if existing.created_at is None:
                existing.created_at = taipei_now()
                db.commit()
            logger.info("管理員帳號已存在，跳過")
    finally:
        db.close()


@app.get("/")
async def root():
    """健康檢查"""
    return {"status": "ok", "message": "Dcard 自動文章生成系統 API"}


@app.get("/health")
async def health_check():
    """健康檢查端點"""
    return {"status": "healthy"}
