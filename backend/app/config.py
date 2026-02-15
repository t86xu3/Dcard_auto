"""
應用程式設定
"""
from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """應用程式設定"""

    # 專案路徑
    BASE_DIR: Path = Path(__file__).resolve().parent.parent

    # 資料庫設定
    DATABASE_URL: str = "sqlite:///./dcard_auto.db"

    # LLM 設定 (Gemini)
    GOOGLE_API_KEY: str = ""
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

    # Dcard 預設看板
    DEFAULT_FORUM: str = "goodthings"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
