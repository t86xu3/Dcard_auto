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
| LLM | Google Gemini API |
| 前端 | React 19 + Vite + Tailwind CSS 4 |
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
擷取商品 → 儲存蝦皮 CDN URL
              ├── 可選：下載到 backend/images/{product_id}/
              └── 文章生成時：
                  ├── LLM 插入 {{IMAGE:product_id:index}} 標記
                  ├── 後端替換為實際圖片 URL
                  └── 匯出時：
                      ├── Phase 1: 標記圖片位置 + 一鍵下載 ZIP
                      └── Phase 2: content-dcard.js 自動插入
```

## 資料模型

### Product
```
id, item_id, shop_id, name, price, original_price, discount,
description, images (JSON), description_images (JSON),
rating, sold, shop_name, product_url, created_at
```

### ProductImage
```
id, product_id (FK), original_url, local_path,
image_type (main/description), downloaded_at
```

### Article
```
id, title, content, content_with_images,
article_type (comparison/review/seo),
target_forum, product_ids (JSON), image_map (JSON),
seo_score, seo_suggestions,
status (draft/optimized/published), published_url,
created_at, updated_at
```

### ApiUsage
```
id, usage_date, requests, input_tokens, output_tokens
```

### PromptTemplate
```
id, name, content (Text), is_default (Boolean), is_builtin (Boolean),
created_at, updated_at
```

## API 端點

| 端點 | 方法 | 說明 |
|------|------|------|
| `/api/products` | GET/POST | 商品 CRUD |
| `/api/products/batch-delete` | POST | 批量刪除 |
| `/api/products/{id}/download-images` | POST | 下載圖片到本地 |
| `/api/articles/generate` | POST | 生成比較文 |
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
| `/api/usage` | GET | API 用量統計 |

## 重要架構模式

### Gemini SDK

使用新版 `google.genai`（`from google import genai`），非舊版 `google.generativeai`。

### 文章生成架構

使用 Gemini `system_instruction`（固定 prompt 範本）+ `contents`（商品資料）分離架構。
Prompt 為雙層結構：`SYSTEM_INSTRUCTIONS`（程式碼層級，不可修改）+ 使用者範本（存 DB，可在設定頁管理）。
生成文章時可指定 `prompt_template_id`，否則使用預設範本。

### Dcard 不支援 Markdown

所有 LLM 生成內容經 `strip_markdown()`（`gemini_utils.py`）清除 Markdown 語法後才存入 DB。

### DB Session 雙模式

- `get_db()`：FastAPI 依賴注入用（generator）
- `get_db_session()`：Celery 等非 FastAPI 環境用（context manager）

### 服務單例

`llm_service` 和 `seo_service` 在模組層級實例化為單例，直接 import 使用。

### Redis

Celery broker 用 db 2，result backend 用 db 3（避免與其他專案衝突）。

## Dcard 目標看板

| 看板別名 | 中文名 | 適用場景 |
|---------|--------|---------|
| `makeup` | 美妝 | 美妝、保養品比較 |
| `goodthings` | 好物研究室 | 通用商品推薦 |
| `girls` | 女孩版 | 生活用品、時尚 |
| `buymakeuptogether` | 美妝團購 | 團購推薦 |
| `food` | 美食 | 食品比較 |

## 開發藍圖

### Phase 1 - 核心功能（完成）

- [x] Chrome Extension（蝦皮擷取 + Dcard 手動輔助）
- [x] 後端 API + DB
- [x] LLM 文章生成（Mock，含圖片標記）
- [x] 圖片下載與備份
- [x] SEO 分析與優化
- [x] 前端 Web UI
- [x] 手動複製貼上發文流程

### Phase 2 - 自動化與擴展

- [ ] Dcard 自動發文（content-dcard.js 自動插圖）
- [x] Prompt 範本系統（內建好物推薦文 + 前端管理介面）
- [ ] 批量生成
- [ ] Chrome Extension icon 美化（設計正式 logo）

### Phase 3 - 雲端部署（程式碼就緒，待部署操作）

架構：Firebase Hosting + Cloud Run + Supabase PostgreSQL（全免費）

- [x] 後端容器化（Dockerfile）
- [x] 程式碼適配（config/database/CORS/alembic）
- [ ] Supabase 資料庫 + Alembic 遷移
- [ ] Cloud Run 部署
- [ ] Firebase Hosting 部署

## 部署架構

```
瀏覽器 → Firebase Hosting (React 靜態檔)
              ├── 靜態資源 → CDN 直接回傳
              └── /api/** → Cloud Run (FastAPI) → Supabase PostgreSQL
```

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

本專案 Chrome Extension 架構基於 `shoppe_autovideo` 專案：
- 來源路徑：`/Users/angrydragon/project/shoppe_autovideo/chrome-extension/`
- 複用模式：三層腳本架構、訊息傳遞、後端同步、Web UI 偵測

## 關鍵文檔

| 文檔 | 說明 |
|------|------|
| `docs/IMPLEMENTATION_PLAN.md` | 完整實作計畫 |
| `PROJECT_MAP.md` | 專案地圖 |
| `skills/project-context.md` | 專案上下文 |
