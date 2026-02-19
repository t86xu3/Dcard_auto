"""
應用程式設定
"""
from pathlib import Path
from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """應用程式設定"""

    # 專案路徑
    BASE_DIR: Path = Path(__file__).resolve().parent.parent

    # 環境設定
    ENVIRONMENT: str = "development"
    ALLOWED_ORIGINS: str = "*"
    PORT: int = 8001

    # 資料庫設定
    DATABASE_URL: str = "sqlite:///./dcard_auto.db"

    # LLM 設定
    GOOGLE_API_KEY: str = ""
    ANTHROPIC_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.5-flash"
    LLM_TEMPERATURE: float = 0.7
    LLM_MAX_TOKENS: int = 16384

    # 圖片下載目錄
    IMAGES_DIR: Path = Path("./images")

    # Celery 任務佇列設定
    CELERY_BROKER_URL: str = "redis://localhost:6379/2"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/3"
    CELERY_TASK_TIMEOUT: int = 300
    CELERY_WORKER_CONCURRENCY: int = 2

    # JWT 認證
    JWT_SECRET_KEY: str = "change-me-in-production-use-a-random-secret"
    JWT_ACCESS_TOKEN_EXPIRE_HOURS: int = 24
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # Dcard 預設看板
    DEFAULT_FORUM: str = "goodthings"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    @property
    def cors_origins(self) -> List[str]:
        if self.ALLOWED_ORIGINS == "*":
            return ["*"]
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
