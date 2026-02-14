# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

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
| `/api/seo/analyze` | POST | SEO 分析 |
| `/api/usage` | GET | API 用量統計 |

## 文章生成類型

| 類型 | Prompt 策略 | 用途 |
|------|------------|------|
| `comparison` | 多商品對比、優缺點分析、推薦結論 + 圖片 | 比較文 |
| `review` | 單品深度評測、使用心得風格 + 商品圖 | 開箱文 |
| `seo` | 關鍵字佈局、長尾詞、結構化標題 + ALT | SEO 文章 |

## Dcard 目標看板

| 看板別名 | 中文名 | 適用場景 |
|---------|--------|---------|
| `makeup` | 美妝 | 美妝、保養品比較 |
| `goodthings` | 好物研究室 | 通用商品推薦 |
| `girls` | 女孩版 | 生活用品、時尚 |
| `buymakeuptogether` | 美妝團購 | 團購推薦 |
| `food` | 美食 | 食品比較 |

## 開發藍圖

### Phase 1 - 核心功能（當前）

- [ ] Chrome Extension（蝦皮擷取 + Dcard 手動輔助）
- [ ] 後端 API + DB
- [ ] LLM 文章生成（含圖片標記）
- [ ] 圖片下載與備份
- [ ] SEO 分析與優化
- [ ] 前端 Web UI
- [ ] 手動複製貼上發文流程

### Phase 2 - 自動化與擴展

- [ ] Dcard 自動發文（content-dcard.js 自動插圖）
- [ ] 文章模板系統
- [ ] 批量生成
- [ ] Docker 部署
- [ ] 雲端部署（AWS/GCP）

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
