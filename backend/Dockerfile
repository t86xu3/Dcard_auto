FROM python:3.11-slim

WORKDIR /app

# 安裝依賴
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 複製程式碼
COPY . .

# Cloud Run 注入 PORT 環境變數（預設 8080）
ENV PORT=8080

# gunicorn + uvicorn worker，單 worker 省記憶體，timeout 300 秒（LLM 生成需要）
# --preload: 預載入 app 減少冷啟動時間
CMD exec gunicorn app.main:app \
    --bind 0.0.0.0:$PORT \
    --workers 1 \
    --worker-class uvicorn.workers.UvicornWorker \
    --timeout 300 \
    --preload
