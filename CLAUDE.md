# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 專案概述

**Dcard 自動文章生成系統** - 從蝦皮擷取商品 → LLM 生成比較文/開箱文 → SEO 優化 → 發佈到 Dcard

功能流程：
1. Chrome Extension 擷取蝦皮商品資料（複用 shoppe_autovideo 攔截架構）
2. 後端 API 儲存商品、下載圖片備份
3. LLM 生成比較文/開箱文（含圖片插入標記）
4. SEO 分析與自動優化
5. 複製到剪貼簿 / Dcard 輔助發文

## 技術棧

| 類別 | 技術 |
|------|------|
| 後端 | FastAPI + SQLAlchemy + Alembic |
| 任務佇列 | Celery + Redis |
| 資料庫 | SQLite (開發) / PostgreSQL (生產) |
| LLM | Google Gemini API + Anthropic Claude API |
| 前端 | React 19 + Vite + Tailwind CSS 4 |
| 認證 | JWT (PyJWT + bcrypt) |
| 擴充功能 | Chrome Manifest V3 |

## 開發指令

### 後端

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt

# 啟動開發伺服器（使用 8001 port，避免與 shoppe_autovideo 衝突）
uvicorn app.main:app --reload --port 8001

# API 文檔: http://localhost:8001/docs
```

### 資料庫遷移

```bash
cd backend && source venv/bin/activate

alembic upgrade head              # 執行遷移
alembic revision --autogenerate -m "描述"  # 生成遷移
alembic current                   # 檢查版本
```

### Celery 任務佇列

```bash
brew services start redis

cd backend && source venv/bin/activate
celery -A app.celery_app worker --loglevel=info --concurrency=2
```

### 前端

```bash
cd frontend
npm install
npm run dev          # 開發伺服器 http://localhost:3001
npm run lint         # ESLint 檢查
npm run build        # 生產建置
```

### 一鍵啟動（tmux）

```bash
./start.sh           # 同時啟動後端 + 前端（tmux session: dcard_auto）
tmux attach -t dcard_auto  # 重新連接
```

### Chrome Extension

載入 `chrome-extension/` 資料夾到 `chrome://extensions/`（開發者模式）

## 系統架構

```
┌─────────────────┐         ┌─────────────────┐         ┌─────────────────┐
│ Chrome Extension │ ──→     │   後端 API      │ ──→     │   Dcard 發文    │
│ (蝦皮擷取)       │  POST   │ (FastAPI+Celery)│  生成    │ (手動/自動)     │
└─────────────────┘ /api     └─────────────────┘         └─────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
              ┌──────────┐  ┌──────────┐  ┌──────────┐
              │ LLM 文章 │  │ SEO 優化 │  │ 圖片服務 │
              │ 生成服務  │  │ 分析服務  │  │ 下載備份  │
              └──────────┘  └──────────┘  └──────────┘
```

### Chrome Extension 三層架構

| 檔案 | 執行環境 | 職責 |
|------|----------|------|
| `injected.js` | 頁面上下文 | 攔截 fetch/XHR，存取 `__NEXT_DATA__` |
| `content-shopee.js` | 蝦皮隔離環境 | 中繼訊息，注入腳本，暫存資料 |
| `content-dcard.js` | Dcard 頁面 | 偵測編輯器，輔助貼上文章 |
| `content-webui.js` | localhost | 廣播 Extension ID |
| `background.js` | Service Worker | 資料處理、儲存、同步後端 |

### 攔截的蝦皮 API

- `/api/v*/item/get`
- `/api/v*/pdp/get_pc`
- `/api/v*/pdp/get`
- `/api/v*/item_detail`

### 開發 Proxy

Vite dev server（port 3001）自動代理 `/api` 請求到後端（port 8001），開發時前後端可直接互通。

### 價格處理

蝦皮 API 價格需 **除以 100000** 才是新台幣金額

### 圖片處理流程

```
擷取商品 → 儲存蝦皮 CDN URL（images + description_images）
              ├── 可選：下載到 backend/images/{product_id}/
              ├── 文章生成時（多模態）：
              │   ├── 使用者勾選「附圖給 LLM」→ 下載圖片 → 傳入 LLM 分析
              │   ├── Gemini: types.Part.from_bytes() / Claude: base64 編碼
              │   └── 圖片來源可選：主圖(max 3)、描述圖(max 5)
              └── 文章生成時（標記）：
                  ├── LLM 插入 {{IMAGE:product_id:index}} 標記
                  ├── 後端替換為實際圖片 URL
                  └── 匯出時：
                      ├── Phase 1: 標記圖片位置 + 一鍵下載 ZIP
                      └── Phase 2: content-dcard.js 自動插入
```

## 資料模型

模型定義見 `backend/app/models/`。以下僅列出非顯而易見的設計：

- **User.is_approved**：管理員核准後才能使用 LLM 功能（`get_approved_user` 依賴注入檢查）
- **Product**：`user_id` FK，`(user_id, item_id)` 組合唯一（同商品不同用戶可各自擷取）
- **Article**：`product_ids` / `image_map` 為 JSON 欄位；`content_with_images` 含 `{{IMAGE:pid:idx}}` 標記
- **UsageRecord**：`(provider, model, usage_date, user_id)` 唯一約束，每天每用戶每模型一筆累加
- **ApiUsage**：舊版用量模型，已被 UsageRecord 取代，保留向後相容

## API 端點

所有端點（除 auth）需 Bearer Token 認證。LLM 相關端點需 `is_approved`。

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/auth/register` | POST | 註冊新用戶 |
| `/api/auth/login` | POST | 登入取得 Token |
| `/api/auth/refresh` | POST | 刷新 Token |
| `/api/auth/me` | GET | 取得當前用戶資訊 |
| `/api/admin/users` | GET | 用戶列表（管理員） |
| `/api/admin/users/{id}/approve` | POST | 核准用戶（管理員） |
| `/api/admin/users/{id}/revoke` | POST | 撤回核准（管理員） |
| `/api/admin/users/{id}/toggle-active` | POST | 啟用/停用（管理員） |
| `/api/admin/usage` | GET | 全站費用總覽 + 按用戶分組（管理員） |
| `/api/admin/system-prompts` | GET | 系統層級提示詞（管理員） |
| `/api/products` | GET/POST | 商品 CRUD |
| `/api/products/{id}` | GET/PATCH | 商品詳情/更新（目前 PATCH 僅支援 product_url） |
| `/api/products/batch-delete` | POST | 批量刪除 |
| `/api/products/{id}/download-images` | POST | 下載圖片到本地 |
| `/api/articles/generate` | POST | 生成比較文（支援 include_images 多模態圖片輸入） |
| `/api/articles` | GET | 文章列表 |
| `/api/articles/{id}` | GET/PUT/DELETE | 文章 CRUD |
| `/api/articles/{id}/optimize-seo` | POST | SEO 優化 |
| `/api/articles/{id}/copy` | GET | Dcard 格式化內容 |
| `/api/articles/{id}/images` | GET | 文章圖片列表 |
| `/api/articles/{id}/images/download` | GET | 打包下載 ZIP |
| `/api/prompts` | GET/POST | Prompt 範本列表/新增 |
| `/api/prompts/{id}` | PUT/DELETE | 範本更新/刪除 |
| `/api/prompts/{id}/set-default` | POST | 設為預設範本 |
| `/api/seo/analyze` | POST | SEO 分析（傳入 title+content） |
| `/api/seo/analyze/{article_id}` | POST | 按文章 ID 分析 SEO 並存入 DB |
| `/api/usage` | GET | API 用量統計（按 provider/model 分組 + 費用 + 30天歷史）|

## 重要架構模式

### 認證架構

JWT 認證（PyJWT + bcrypt），前端 token 存 localStorage。
三層權限依賴注入：`get_current_user`（基本認證）→ `get_current_admin`（管理員）→ `get_approved_user`（已核准，可用 LLM）。
Token sub claim 為字串型 user_id（`str(user.id)`），解碼時轉回 `int`。
管理員帳號由環境變數 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 控制，lifespan 自動 seed。

### PyJWT import 模式

從 python-jose 遷移而來，import 方式非直覺：
```python
import jwt
from jwt import InvalidTokenError as JWTError
# jwt.encode() / jwt.decode() 用法與 python-jose 相同
```

### Gemini SDK

使用新版 `google.genai`（`from google import genai`），非舊版 `google.generativeai`。

### 文章生成架構（多供應商）

支援 Gemini + Anthropic Claude 雙供應商。透過 `is_anthropic_model()` 判斷 model 前綴自動路由。
Prompt 為雙層結構：`SYSTEM_INSTRUCTIONS`（程式碼層級，不可修改）+ 使用者範本（存 DB，可在設定頁管理）。
生成文章時可指定 `prompt_template_id` 和 `model`，否則使用預設範本和預設模型。
前端透過 localStorage 持久化使用者選擇的模型。
支援多模態圖片輸入：`include_images=True` 時下載商品圖片（主圖/描述圖）傳入 LLM 分析。

### Dcard 不支援 Markdown

所有 LLM 生成內容經 `strip_markdown()`（`gemini_utils.py`）清除 Markdown 語法後才存入 DB。

### DB Session 雙模式

- `get_db()`：FastAPI 依賴注入用（generator）
- `get_db_session()`：Celery 等非 FastAPI 環境用（context manager）

### 服務單例

`llm_service` 和 `seo_service` 在模組層級實例化為單例，直接 import 使用。

### Redis

Celery broker 用 db 2，result backend 用 db 3（避免與其他專案衝突）。

### Alembic Migration 注意事項

- **SQLite 相容**：修改既有表必須用 `op.batch_alter_table()` 包裹（SQLite 不支援 ALTER COLUMN）
- **PostgreSQL 相容**：INSERT boolean 值必須用 SQLAlchemy bound params（`bindparams(is_active=True)`），不可用 integer literal `1`/`0`
- **雙 DB 測試**：本地跑 `alembic current` 確認 SQLite 不受影響，再用 `DATABASE_URL=... alembic upgrade head` 跑 Supabase

## Dcard 目標看板

| 看板別名 | 中文名 | 適用場景 |
|---------|--------|---------|
| `makeup` | 美妝 | 美妝、保養品比較 |
| `goodthings` | 好物研究室 | 通用商品推薦 |
| `girls` | 女孩版 | 生活用品、時尚 |
| `buymakeuptogether` | 美妝團購 | 團購推薦 |
| `food` | 美食 | 食品比較 |

## 開發藍圖

Phase 1（核心功能）、Phase 3（雲端部署）、Phase 4（多用戶帳號）均已完成。

### Phase 2 - 自動化與擴展（進行中）

- [ ] Dcard 自動發文（content-dcard.js 自動插圖）
- [x] Prompt 範本系統（內建好物推薦文 + 前端管理介面）
- [x] 多模型支援（Gemini Flash/Pro/3Pro + Claude Sonnet/Haiku）
- [x] 費用追蹤頁面（按模型分組統計 + 30 天趨勢圖 + 管理員全站總覽）
- [x] LLM 多模態圖片輸入（附圖給 LLM 分析商品規格/成分/尺寸）
- [x] 商品網址手動編輯 + LLM 正確對應連結
- [ ] 批量生成
- [ ] Chrome Extension icon 美化（設計正式 logo）

## 部署架構

```
瀏覽器 → Firebase Hosting (React 靜態檔)
              ├── 靜態資源 → CDN 直接回傳
              └── /api/** → Cloud Run (FastAPI) → Supabase PostgreSQL
```

### 環境資訊

| 項目 | 值 |
|------|-----|
| Firebase 專案 | `dcard-auto` |
| 前端 URL | https://dcard-auto.web.app |
| Cloud Run Service | `dcard-auto-backend`（asia-east1） |
| Artifact Registry | `asia-east1-docker.pkg.dev/dcard-auto/cloud-run-source-deploy/dcard-auto-backend` |
| Supabase 區域 | ap-southeast-1（Pooler port 6543） |
| Cloud Run 環境變數 | `DATABASE_URL`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS`, `JWT_SECRET_KEY`, `ADMIN_*` |

### 部署指令

```bash
# 後端部署（Cloud Run）
cd backend
gcloud builds submit --tag asia-east1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/dcard-auto-backend
gcloud run deploy dcard-auto-backend --image IMAGE_URL --region asia-east1

# 前端部署（Firebase Hosting）
cd frontend && npm run build
cd .. && firebase deploy --only hosting

# 資料庫遷移（Supabase）
cd backend
DATABASE_URL="postgresql://..." alembic upgrade head
```

## 參考來源

Chrome Extension 架構複用自 `shoppe_autovideo` 專案的三層腳本模式（injected → content → background）。

## 關鍵文檔

| 文檔 | 說明 |
|------|------|
| `docs/IMPLEMENTATION_PLAN.md` | 完整實作計畫 |
| `PROJECT_MAP.md` | 專案地圖 |
| `skills/project-context.md` | 專案上下文 |
