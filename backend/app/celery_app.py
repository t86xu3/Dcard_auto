"""
Celery 應用程式初始化

啟動 Worker:
    cd backend
    celery -A app.celery_app worker --loglevel=info --concurrency=2
"""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "dcard_auto",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=["app.tasks.article_tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="Asia/Taipei",
    enable_utc=True,
    task_soft_time_limit=settings.CELERY_TASK_TIMEOUT - 60,
    task_time_limit=settings.CELERY_TASK_TIMEOUT,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_concurrency=settings.CELERY_WORKER_CONCURRENCY,
    result_expires=86400,
    broker_connection_retry_on_startup=True,
)
