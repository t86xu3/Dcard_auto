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
| 蝦皮聯盟 API | Shopee Affiliate Open API (GraphQL + SHA256) |
| 任務佇列 | Celery + Redis |
| 資料庫 | SQLite (開發) / PostgreSQL (生產) |
| LLM | Google Gemini API + Anthropic Claude API |
| 前端 | React 19 + Vite + Tailwind CSS 4 + @dnd-kit |
| 認證 | JWT (PyJWT + bcrypt) |
| 擴充功能 | Chrome Manifest V3 |

## 開發指令

### 後端

```bash
cd backend
python3 -m venv venv && source venv/bin/activate  # 首次需建立 venv
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
| `content-shopee.js` | 蝦皮隔離環境 | 中繼訊息，注入腳本，暫存資料，自動擷取模式（`#dcard-auto-capture`） |
| `content-dcard.js` | Dcard 頁面 | 偵測編輯器，輔助貼上文章 |
| `content-webui.js` | localhost | 廣播 Extension ID |
| `background.js` | Service Worker | 資料處理、儲存、同步後端、批量擷取狀態機 |

### 攔截的蝦皮 API

- `/api/v*/item/get`
- `/api/v*/pdp/get_pc`
- `/api/v*/pdp/get`
- `/api/v*/item_detail`

### 開發 Proxy

Vite dev server（port 3001）自動代理 `/api` 請求到後端（port 8001），開發時前後端可直接互通。

### 價格處理

蝦皮商品頁 API 價格需 **除以 100000** 才是新台幣金額（聯盟 API 已為實際金額）

### 蝦皮聯盟 API 資料型別（重要！多次踩坑）

Shopee Affiliate Open API（`productOfferV2` / `shopOfferV2`）回傳的欄位型別**非直覺**，前端必須做型別轉換：

| 欄位 | API 回傳型別 | 範例值 | 說明 |
|------|-------------|--------|------|
| `commissionRate` | **String（小數）** | `"0.9"` = 90%, `"0.01"` = 1% | 需 `parseFloat()` + `*100` 才是百分比 |
| `priceMin` / `priceMax` | **String** | `"299"` | 需 `parseFloat()` |
| `commission` | **String** | `"59.8"` | 預估佣金金額，需 `parseFloat()` |
| `ratingStar` | **String** | `"4.9"` | 需 `parseFloat()` |
| `shopType` | **Array[Int]** | `[1]`, `[2]`, `[1,2]` | 不是單一 Int！用 `.includes()` 判斷（1=Mall, 2=Star, 4=Star+）|
| `sales` | **Int** | `571` | 唯一是 int 的數值欄位 |
| `priceDiscountRate` | **String** | `"47"` | 折扣百分比 |

**後端 `explore_products()` 已做型別轉換**：加入 `_commissionPct`、`_price`、`_sales`、`_rating` 等預處理欄位。但前端不應只依賴 `_` 前綴欄位，應同時 fallback 到原始欄位（`item._sales || item.sales`），以防後端版本差異。

**API limit 上限 ~50**：Shopee API 實測 `limit > 50` 會回傳空陣列，後端已限制 `le=50`。

**佣金率轉換**：API 回傳小數（`0.9 = 90%`），用戶輸入百分比（`5 = 5%`），後端比較時 `cr * 100 < min_commission_rate`。

### 圖片處理流程

```
擷取商品 → 儲存蝦皮 CDN URL（images + description_images）
              ├── 可選：下載到 backend/images/{product_id}/
              ├── 文章生成時（多模態）：
              │   ├── 使用者勾選「附描述圖給 LLM」→ 下載描述圖(max 5) → 傳入 LLM 分析
              │   ├── Gemini: types.Part.from_bytes()（失敗自動 fallback 純文字）
              │   ├── Claude: 兩階段策略（Gemini Flash 讀圖 → 純文字傳 Claude）
              │   └── 過濾 < 1KB 的損壞/空白圖片
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
- **Product**：`user_id` FK，`(user_id, item_id)` 組合唯一（同商品不同用戶可各自擷取）；`affiliate_url` 存蝦皮聯盟行銷短網址，`name="待擷取"` 為 placeholder（等待 Extension 擷取填充）
- **Article**：`product_ids` / `image_map` 為 JSON 欄位；`content_with_images` 含 `{{IMAGE:pid:idx}}` 標記；`sub_id` 為蝦皮聯盟行銷追蹤用（生成文章時選填）；`status` 可為 `generating`/`failed`/`draft`/`optimized`/`published`
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
| `/api/products/import-affiliate-urls` | POST | 批量匯入聯盟行銷短網址（建立 placeholder） |
| `/api/products` | GET/POST | 商品 CRUD（POST 支援 upsert placeholder） |
| `/api/products/{id}` | GET/PATCH | 商品詳情/更新（目前 PATCH 僅支援 product_url） |
| `/api/products/batch-delete` | POST | 批量刪除商品 |
| `/api/products/{id}/download-images` | POST | 下載圖片到本地 |
| `/api/articles/image-proxy` | GET | 代理下載外部圖片（解決跨域） |
| `/api/articles/generate` | POST | 非同步生成文章（立即回傳 placeholder，背景執行緒生成） |
| `/api/articles/batch-delete` | POST | 批量刪除文章 |
| `/api/articles` | GET | 文章列表 |
| `/api/articles/{id}` | GET/PUT/DELETE | 文章 CRUD（PUT content 自動同步 content_with_images） |
| `/api/articles/{id}/optimize-seo` | POST | SEO 優化（自動更新標題+內容+分數） |
| `/api/articles/{id}/copy` | GET | Dcard 格式化內容 |
| `/api/articles/{id}/images` | GET | 文章圖片列表 |
| `/api/articles/{id}/images/download` | GET | 打包下載 ZIP |
| `/api/prompts` | GET/POST | Prompt 範本列表/新增 |
| `/api/prompts/{id}` | PUT/DELETE | 範本更新/刪除（含內建範本） |
| `/api/prompts/{id}/set-default` | POST | 設為預設範本 |
| `/api/seo/analyze` | POST | SEO 分析（傳入 title+content） |
| `/api/seo/analyze/{article_id}` | POST | 按文章 ID 分析 SEO 並存入 DB |
| `/api/usage` | GET | API 用量統計（按 provider/model 分組 + 費用 + 30天歷史）|
| `/api/shopee/offers` | GET | 蝦皮平台促銷活動（shopeeOfferV2）|
| `/api/shopee/shop-offers` | GET | 蝦皮商店佣金優惠（shopOfferV2）|
| `/api/shopee/product-offers` | GET | 蝦皮高佣金商品（productOfferV2）|
| `/api/shopee/explore` | GET | 蝦皮商品探索（彈性查詢 + 後端過濾：keyword/排序/佣金/銷量/價格/評分）|
| `/api/announcements` | GET | 取得啟用中公告（所有登入用戶） |
| `/api/announcements/admin` | GET | 取得所有公告含停用（管理員） |
| `/api/announcements` | POST | 新增公告（管理員） |
| `/api/announcements/{id}` | PUT | 編輯公告（管理員） |
| `/api/announcements/{id}` | DELETE | 刪除公告（管理員） |
| `/api/announcements/{id}/toggle` | POST | 切換公告啟用/停用（管理員） |

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

**`HttpOptions.timeout` 單位是毫秒**：SDK 內部 `timeout / 1000.0` 轉為秒後設 `X-Server-Timeout` header。設定 300 秒 timeout 須寫 `HttpOptions(timeout=300_000)`，寫 `300` 會變成 0.3 秒被 API 拒絕。

### 文章生成架構（非同步 + 多供應商）

**非同步生成**：`POST /generate` 建立 placeholder Article（`status="generating"`）後立即回傳，啟動 `threading.Thread` 在背景執行 LLM 生成。背景執行緒使用獨立 DB session（`get_db_session()`），成功更新為 `status="draft"`，失敗更新為 `status="failed"`（content 存詳細錯誤報告含 traceback）。Cloud Run 部署需加 `--no-cpu-throttling` 確保回應後背景執行緒仍有 CPU。

**LLM 呼叫重試**：`_call_gemini` / `_call_anthropic` 內建 max 3 次重試（指數退避 5s/10s/20s），超時和暫時性錯誤（500/503/timeout）自動重試，圖片錯誤 fallback 純文字。重試歷史記錄在 `error.retry_history` 屬性上，失敗時寫入文章 content 供前端顯示。

**商品順序保留**：前端用有序陣列（`@dnd-kit` 拖拽排序），後端 SQL `IN` 查詢後按 `product_ids` 順序重排（dict lookup + list comprehension）。

**Article status 值**：`generating`（生成中）→ `draft`（草稿）→ `optimized`（已 SEO 優化）→ `published`（已發佈）；`failed`（生成失敗，content 為錯誤報告）。

支援 Gemini + Anthropic Claude 雙供應商。透過 `is_anthropic_model()` 判斷 model 前綴自動路由。
Prompt 為雙層結構：`SYSTEM_INSTRUCTIONS`（程式碼層級，不可修改）+ 使用者範本（存 DB，可在設定頁管理）。
內建兩套範本：「Dcard 好物推薦文」（V1）和「Google 排名衝刺版」（V2，基於 9 篇 Google 首頁文章逆向工程）。內建範本僅管理員可編輯/刪除（後端 403 + 前端唯讀）。
範本系統為 per-user 隔離：自訂範本只有建立者看得到，`set-default` 只影響自己（不動其他用戶），`get_default_prompt(db, user_id)` 先找用戶自訂預設再 fallback 內建預設。
生成文章時可指定 `prompt_template_id` 和 `model`，否則使用預設範本和預設模型。
LLM 生成時動態注入當前年份（`datetime.now().year`），避免 LLM 使用舊年份。
生成完成後 regex 清除殘留的 `{{IMAGE:...}}` 標記（LLM 可能產生不存在的索引）。
前端透過 localStorage 持久化使用者選擇的模型。
支援多模態圖片輸入：`include_images=True` 時下載商品描述圖傳入 LLM 分析（前端已移除主圖選項，固定只傳描述圖）。
兩階段圖片策略：Claude 模型附圖時，先用 Gemini Flash 提取圖片文字（`_extract_image_info()`），再傳純文字給 Claude，節省 ~60% 圖片成本；Gemini 模型則直接傳圖片（圖片處理失敗時自動 fallback 為純文字模式）。
SEO 優化強制使用 `gemini-2.5-flash`（不管前端選什麼模型），節省成本。
SEO 優化時自動從 LLM 輸出解析新標題（第一個非空行），同時更新 `article.title` 和 `article.content`，after_analysis 使用新標題重新評分。
標題長度規範全站統一為 20-35 字（生成範本、SEO 優化 prompt、SYSTEM_INSTRUCTIONS、SEO 評分引擎）。

### 一鍵擷取（批量自動擷取）

前端直連 `background.js`（`chrome.runtime.sendMessage(extensionId, ...)`）+ 2 秒輪詢進度。
流程：前端發 `BATCH_CAPTURE_START`（含 placeholder 商品 URL 列表）→ background 逐一開啟蝦皮分頁（`url#dcard-auto-capture`，`active: false` 背景開啟）→ `content-shopee.js` 偵測 hash 自動送出資料 → background 比對 `sender.tab.id === batchCapture.currentTabId` 辨識批量資料 → 儲存+同步後端 → 關閉分頁 → 2-4 秒隨機延遲 → 下一個。
單項 30 秒逾時，擷取在 Extension background 獨立運行（前端關閉不中斷），重新開啟頁面自動恢復進度顯示。

### 蝦皮商品探索（`explore_products`）

`GET /api/shopee/explore` 支援 14 個 Query 參數的彈性查詢，前端 `ExplorePage` 提供 4 個預設 Tab：
- 熱門商品（`sort_type=2, list_type=2`）
- 潛在熱門（`sort_type=2, min_commission_rate=3, min_sales=10, max_sales=5000`）
- 高分潤（`sort_type=5`）
- 自定義查詢（完整篩選面板）

後端 `explore_products()` 動態組建 GraphQL query + variables，回傳後做型別轉換（String → float）再以用戶輸入的百分比值過濾。不走前端快取（搜尋條件組合太多）。前端數值篩選（佣金率、銷量、價格、評分）在所有 Tab 都可覆蓋預設值。

### Dcard 不支援 Markdown

所有 LLM 生成內容經 `strip_markdown()`（`gemini_utils.py`）清除 Markdown 語法後才存入 DB。

### DB Session 雙模式

- `get_db()`：FastAPI 依賴注入用（generator）
- `get_db_session()`：背景執行緒 / Celery 等非 FastAPI 環境用（context manager）

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

- [x] Dcard 半自動發文（自動填標題 + 貼內文 + 圖片一鍵插入工具列）
- [x] Dcard 全自動發文（逐段建構文字+圖片 + Lexical state 同步 + Cloudflare 對策）
- [x] Prompt 範本系統（內建好物推薦文 + 前端管理介面）
- [x] 多模型支援（Gemini Flash/Pro/3Pro + Claude Sonnet/Haiku）
- [x] 費用追蹤頁面（按模型分組統計 + 30 天趨勢圖 + 管理員全站總覽 + 日期篩選）
- [x] LLM 多模態圖片輸入（附圖給 LLM 分析商品規格/成分/尺寸）
- [x] 商品網址手動編輯 + LLM 正確對應連結
- [x] UI 圖標與點擊回饋（全站按鈕加 emoji + active:scale-95）
- [x] SEO 排名衝刺版範本（V2，基於 Google 首頁文章逆向工程）
- [x] 管理員頁面系統提示詞檢視（4 區塊）
- [x] SEO 優化強制使用 gemini-2.5-flash（節省成本）
- [x] 瀏覽器分頁 favicon + 標題
- [x] 非同步文章生成（背景執行緒 + placeholder + 前端輪詢）
- [x] SEO 優化自動更新標題（LLM 輸出解析 + DB 同步）
- [x] 文章編輯自動同步 content_with_images
- [x] SEO 面板折疊（預設收合，點擊展開）
- [x] Gemini 圖片處理 fallback（400 錯誤 → 純文字重試）
- [x] 標題長度規範統一（20-35 字）
- [x] 內建範本可編輯/刪除
- [x] 商品拖拽排序（@dnd-kit，控制文章中商品出現順序）
- [x] LLM 呼叫重試機制（指數退避 + 詳細錯誤報告）
- [x] 範本 per-user 隔離（自訂範本私有 + 內建範本僅管理員可改）
- [x] 文章批量選取刪除
- [x] 文章列表重新整理按鈕
- [x] Chrome Extension icon 美化（藍色漸層 D 字母 + 橙色通知徽章）
- [x] Extension popup 顯示版本號 + 下載最新版連結
- [x] Extension 一鍵清除 Dcard Cookie（排解 Cloudflare 503 封鎖）
- [x] API 快取層（stale-while-revalidate）+ 路由分割 + 輪詢退避
- [x] 蝦皮聯盟行銷網址批量匯入 + Sub_id 追蹤
- [x] 一鍵擷取（批量自動開啟蝦皮分頁擷取待擷取商品，進度面板 + beforeunload 防護）
- [x] 儀表板蝦皮聯盟行銷資料（平台活動/商店佣金/高佣金商品 3 區塊，移除 API 用量）
- [x] 蝦皮商品探索頁面（4 Tab 預設模式 + 彈性篩選 + 匯入 placeholder + 載入更多）
- [ ] 批量生成
- [ ] 手機版 RWD 介面（響應式設計適配行動裝置）
- [x] 時區問題修正（前後端時間顯示一致）
- [x] 公告功能（管理員發佈公告 + 儀表板顯示 + CRUD 管理）
- [ ] TG 機器人整合（通知 / 操作自動化）

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
| Cloud Run 環境變數 | `DATABASE_URL`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS`, `JWT_SECRET_KEY`, `ADMIN_*`, `SHOPEE_APP_ID`, `SHOPEE_SECRET` |

### 部署指令

```bash
# 後端部署（Cloud Run）
cd backend
gcloud builds submit --tag asia-east1-docker.pkg.dev/PROJECT_ID/cloud-run-source-deploy/dcard-auto-backend
gcloud run deploy dcard-auto-backend --image IMAGE_URL --region asia-east1 --no-cpu-throttling

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
| `docs/TECH_REFERENCE.md` | 完整技術參考手冊（依賴版本、配置規格、內部機制） |
| `docs/IMPLEMENTATION_PLAN.md` | 完整實作計畫 |
| `PROJECT_MAP.md` | 專案地圖 |
| `skills/project-context.md` | 專案上下文 |

### 文檔同步補充

commit 涉及以下變更時，`docs/TECH_REFERENCE.md` 也需同步更新：

| 變更類型 | 需更新的章節 |
|----------|-------------|
| 升級/新增依賴 | 後端依賴 / 前端依賴 |
| 修改環境變數 | 環境變數完整參考 |
| 修改 DB Schema | 資料庫模型 |
| 修改 LLM 模型或定價 | LLM 服務架構 |
| 修改 API timeout / 新增 API 函數 | Axios API Client |
| 修改 Docker / 部署配置 | Docker 與部署配置 |
