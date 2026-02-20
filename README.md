# Dcard Auto - 蝦皮商品自動文章生成系統

從蝦皮擷取商品資料，透過 LLM 自動生成比較文 / 開箱文，SEO 優化後發佈到 Dcard。

**當前版本：1.0.0**

## 功能特色

- **Chrome Extension 一鍵擷取** — 瀏覽蝦皮商品頁面自動攔截 API，擷取商品資料與圖片
- **多模型文章生成** — 支援 Gemini Flash / Pro / 3 Pro 及 Claude Sonnet / Haiku，可自由切換
- **多模態圖片分析** — LLM 直接讀取商品描述圖，提取規格、成分、尺寸等資訊融入文章
- **SEO 8 項評分引擎** — 自動分析標題、內文、關鍵字密度等，一鍵 LLM 優化
- **Prompt 範本管理** — 內建「好物推薦文」與「Google 排名衝刺版」範本，支援自訂
- **費用追蹤** — 按模型分組統計 API 用量與成本，含 30 天趨勢圖
- **多用戶帳號** — JWT 認證 + 管理員核准制，資料隔離
- **雲端部署** — Firebase Hosting + Cloud Run + Supabase，全免費額度可用

## 系統架構

```
瀏覽器 (蝦皮)                     瀏覽器 (Web UI)
      │                                │
  Chrome Extension              React + Vite
  (攔截商品 API)              (Tailwind CSS 4)
      │                                │
      └────── POST /api ───────────────┘
                    │
            Firebase Hosting
            (靜態檔 + /api 轉發)
                    │
              Cloud Run
           (FastAPI + Gunicorn)
                    │
         ┌──────────┼──────────┐
         │          │          │
    Gemini API  Claude API  Supabase
    (文章生成)  (文章生成)  (PostgreSQL)
```

## 快速開始

### 前置需求

- Python 3.11+
- Node.js 18+
- Redis（Celery 用，可選）

### 後端

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 設定環境變數
cp .env.example .env
# 編輯 .env，填入 GOOGLE_API_KEY、ADMIN_PASSWORD 等

# 資料庫初始化
alembic upgrade head

# 啟動（port 8001）
uvicorn app.main:app --reload --port 8001
# API 文檔: http://localhost:8001/docs
```

### 前端

```bash
cd frontend
npm install
npm run dev
# 開發伺服器: http://localhost:3001
# Vite 自動代理 /api → localhost:8001
```

### 一鍵啟動

```bash
./start.sh
# 同時啟動後端 + 前端（tmux session: dcard_auto）
tmux attach -t dcard_auto  # 重新連接
```

### Chrome Extension

1. 開啟 `chrome://extensions/`，啟用開發者模式
2. 載入未封裝擴充功能 → 選擇 `chrome-extension/` 資料夾
3. 前往蝦皮商品頁面，Extension 自動攔截商品資料

## 環境變數

| 變數 | 說明 | 預設值 |
|------|------|--------|
| `DATABASE_URL` | 資料庫連線 | `sqlite:///./dcard_auto.db` |
| `GOOGLE_API_KEY` | Gemini API Key | （必填） |
| `ANTHROPIC_API_KEY` | Claude API Key | （選填） |
| `JWT_SECRET_KEY` | JWT 簽章密鑰 | （生產環境必改） |
| `ADMIN_USERNAME` | 管理員帳號 | `admin` |
| `ADMIN_PASSWORD` | 管理員密碼 | （必填） |
| `ENVIRONMENT` | 環境 (`development` / `production`) | `development` |
| `ALLOWED_ORIGINS` | CORS 允許來源 | `*` |

## 技術棧

| 類別 | 技術 |
|------|------|
| 後端 | FastAPI + SQLAlchemy + Alembic |
| 資料庫 | SQLite（開發）/ PostgreSQL（生產） |
| LLM | Google Gemini API + Anthropic Claude API |
| 前端 | React 19 + Vite + Tailwind CSS 4 |
| 認證 | JWT（PyJWT + bcrypt） |
| 擴充功能 | Chrome Manifest V3 |
| 部署 | Firebase Hosting + Cloud Run + Supabase |

## 部署

### 後端（Cloud Run）

```bash
cd backend
gcloud builds submit --tag asia-east1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/dcard-auto-backend
gcloud run deploy dcard-auto-backend \
  --image IMAGE_URL \
  --region asia-east1 \
  --no-cpu-throttling
```

### 前端（Firebase Hosting）

```bash
cd frontend && npm run build
cd .. && firebase deploy --only hosting
```

### 資料庫遷移（Supabase）

```bash
cd backend
DATABASE_URL="postgresql://..." alembic upgrade head
```

## 專案結構

```
Dcard_auto/
├── chrome-extension/     # Chrome 擴充功能（蝦皮擷取 + Dcard 輔助）
├── backend/
│   ├── app/
│   │   ├── api/          # API 路由（auth, products, articles, seo, prompts, usage, admin）
│   │   ├── models/       # SQLAlchemy 模型
│   │   ├── services/     # 商業邏輯（LLM, SEO, 圖片, 用量追蹤）
│   │   ├── db/           # 資料庫設定
│   │   └── main.py       # FastAPI 入口
│   ├── alembic/          # DB 遷移
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api/          # Axios 客戶端（含快取層 + Token 自動刷新）
│   │   ├── pages/        # 頁面元件（React.lazy 路由分割）
│   │   ├── components/   # 共用元件（Layout, SeoPanel, ProtectedRoute）
│   │   └── contexts/     # AuthContext
│   └── vite.config.js
├── docs/                 # 技術參考手冊 + 實作計畫
└── firebase.json         # Firebase Hosting 設定
```

## 授權

私人專案，未公開授權。
