# PROJECT_MAP.md

## 專案概述
- 專案名稱：Dcard_auto
- 專案目的：從蝦皮擷取商品資訊，自動產生比較文/開箱文，SEO 優化後發佈到 Dcard

## 技術棧
| 類別 | 技術 | 版本 | 說明 |
|------|------|------|------|
| 語言 | Python | 3.11+ | 後端 |
| 語言 | JavaScript | ES2022 | 前端 + Extension |
| 後端框架 | FastAPI | latest | REST API |
| ORM | SQLAlchemy | 2.x | 資料庫抽象 |
| DB 遷移 | Alembic | latest | Schema 版本控制 |
| 任務佇列 | Celery + Redis | latest | 非同步文章生成 |
| 資料庫 | SQLite → PostgreSQL | - | 開發用 SQLite / 生產用 Supabase PostgreSQL |
| LLM | Google Gemini API | 2.5 Flash/Pro, 3 Pro | 文章生成 + SEO 優化 |
| LLM | Anthropic Claude API | Sonnet 4.5, Haiku 4.5 | 文章生成 + SEO 優化 |
| 認證 | PyJWT + bcrypt | 2.10.1 / 5.0.0 | JWT Token 認證 |
| 前端框架 | React + Vite | 19 / 6 | Web UI |
| CSS | Tailwind CSS | 4 | 樣式 |
| 擴充功能 | Chrome Manifest V3 | - | 商品擷取 + Dcard 輔助發文 |
| 前端部署 | Firebase Hosting | - | 免費 CDN，/api 轉發到 Cloud Run |
| 後端部署 | Cloud Run | - | 容器化 FastAPI，免費額度 |
| 生產資料庫 | Supabase PostgreSQL | 免費版 | 500MB，Tokyo region |

## 目錄結構

```
Dcard_auto/
├── chrome-extension/          # Chrome 擴充功能（雙站點）
│   ├── manifest.json          # Manifest V3
│   ├── injected.js            # 蝦皮 API 攔截
│   ├── content-shopee.js      # 蝦皮 content script
│   ├── content-dcard.js       # Dcard 發文輔助
│   ├── content-webui.js       # Web UI 偵測
│   ├── background.js          # Service Worker
│   ├── popup.html / .css / .js
│   └── icons/
│
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI 入口
│   │   ├── config.py          # Pydantic Settings
│   │   ├── celery_app.py      # Celery 設定
│   │   ├── db/
│   │   │   └── database.py    # SQLAlchemy（SQLite→PostgreSQL）
│   │   ├── models/
│   │   │   ├── user.py        # 用戶模型（含 is_approved）
│   │   │   ├── product.py     # 商品模型（+user_id FK）
│   │   │   ├── product_image.py # 圖片備份模型
│   │   │   ├── article.py     # 文章模型（+user_id FK）
│   │   │   ├── api_usage.py   # API 用量追蹤（舊，保留）
│   │   │   ├── usage_record.py # 多供應商/多模型用量追蹤
│   │   │   └── prompt_template.py # Prompt 範本模型（+user_id FK）
│   │   ├── auth.py            # JWT 認證模組
│   │   ├── api/
│   │   │   ├── auth.py        # 認證 API（register/login/refresh/me）
│   │   │   ├── admin.py       # 管理員 API（用戶列表/核准）
│   │   │   ├── products.py    # 商品 CRUD（+認證+資料隔離）
│   │   │   ├── articles.py    # 文章生成/管理（+認證+資料隔離）
│   │   │   ├── prompts.py     # Prompt 範本 CRUD（+認證）
│   │   │   ├── seo.py         # SEO 分析/優化（+認證）
│   │   │   └── usage.py       # 用量統計（+認證+user過濾）
│   │   ├── services/
│   │   │   ├── gemini_utils.py  # Gemini 共用工具（strip_markdown + track_usage）
│   │   │   ├── llm_service.py # Gemini 文章生成（system_instruction 分離）
│   │   │   ├── prompts.py     # Prompt 範本服務 + seed
│   │   │   ├── seo_service.py # SEO 8 項評分引擎 + LLM 優化
│   │   │   ├── image_service.py # 圖片下載、備份、打包
│   │   │   └── usage_tracker.py
│   │   └── tasks/
│   │       └── article_tasks.py # Celery 非同步任務
│   ├── alembic/               # DB 遷移
│   ├── images/                # 下載的商品圖片
│   ├── Dockerfile            # Cloud Run 容器化
│   ├── .dockerignore         # Docker 建置排除
│   ├── requirements.txt
│   ├── .env.example
│   └── start.sh
│
├── frontend/
│   ├── src/
│   │   ├── api/               # API 客戶端（含 token interceptor）
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx # 認證 Context + useAuth hook
│   │   ├── components/        # 共用元件
│   │   │   ├── Layout.jsx     # 側邊欄（含用戶資訊+登出+管理員導航）
│   │   │   ├── ProtectedRoute.jsx # 路由守衛
│   │   │   └── SeoPanel.jsx   # SEO 分析面板（環形分數圖 + 8 項進度條）
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx      # 登入/註冊頁
│   │   │   ├── AdminPage.jsx      # 管理員：用戶管理
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── ProductsPage.jsx
│   │   │   ├── ArticlesPage.jsx   # 文章管理
│   │   │   ├── SettingsPage.jsx
│   │   │   ├── UsagePage.jsx      # 費用追蹤頁面
│   │   │   └── GuidePage.jsx     # 測試人員使用說明
│   │   └── hooks/
│   │       └── useExtensionDetect.js
│   ├── package.json
│   └── vite.config.js
│
├── docs/                      # 詳細設計文檔
│   └── IMPLEMENTATION_PLAN.md
├── firebase.json             # Firebase Hosting + Cloud Run rewrite
├── .firebaserc               # Firebase 專案設定
├── CLAUDE.md
├── PROJECT_MAP.md
└── skills/
    └── project-context.md
```

## 核心模組索引

| 模組/功能 | 檔案路徑 | 說明 |
|-----------|----------|------|
| 蝦皮 API 攔截 | chrome-extension/injected.js | 攔截 fetch/XHR 商品 API |
| 蝦皮擷取 | chrome-extension/content-shopee.js | 暫存商品、手動擷取觸發 |
| Dcard 發文輔助 | chrome-extension/content-dcard.js | 偵測編輯器、自動填入 |
| Web UI 偵測 | chrome-extension/content-webui.js | 廣播 Extension ID |
| Service Worker | chrome-extension/background.js | 資料處理、儲存、同步 |
| JWT 認證模組 | backend/app/auth.py | 密碼雜湊 + Token 簽發/驗證 + 依賴注入 |
| 認證 API | backend/app/api/auth.py | 註冊/登入/刷新 Token/取得用戶資訊 |
| 管理員 API | backend/app/api/admin.py | 用戶列表/核准/停用/全站費用總覽 |
| 商品 API | backend/app/api/products.py | 商品 CRUD + 圖片下載（+認證+資料隔離）|
| 文章生成 API | backend/app/api/articles.py | 比較文/開箱文生成（+認證+資料隔離）|
| SEO 分析 API | backend/app/api/seo.py | SEO 評分 + 按文章 ID 分析並存入 DB（+認證）|
| Prompt 範本 API | backend/app/api/prompts.py | 範本 CRUD + 設為預設（+認證）|
| LLM 服務 | backend/app/services/llm_service.py | Gemini 文章生成（system_instruction 分離）|
| Prompt 範本服務 | backend/app/services/prompts.py | 內建範本 seed + 預設取得 |
| Gemini 共用工具 | backend/app/services/gemini_utils.py | strip_markdown + track_usage |
| SEO 服務 | backend/app/services/seo_service.py | 8 項 SEO 評分引擎 + LLM 優化 |
| 圖片服務 | backend/app/services/image_service.py | 圖片下載、備份、打包 ZIP |
| 文章任務 | backend/app/tasks/article_tasks.py | Celery 非同步生成 |
| 儀表板 | frontend/src/pages/DashboardPage.jsx | 系統概覽 |
| 商品管理 | frontend/src/pages/ProductsPage.jsx | 商品列表與操作 |
| 文章管理 | frontend/src/pages/ArticlesPage.jsx | 文章編輯與發佈 |
| SEO 面板 | frontend/src/components/SeoPanel.jsx | 環形分數圖 + 8 項進度條 + 關鍵字標籤 |
| Extension 偵測 | frontend/src/hooks/useExtensionDetect.js | 自動偵測插件 |
| 費用追蹤 | frontend/src/pages/UsagePage.jsx | 按模型分組的費用統計 + 30天趨勢 + 管理員全站總覽 |
| 使用說明 | frontend/src/pages/GuidePage.jsx | 測試人員操作指南 |
| 認證 Context | frontend/src/contexts/AuthContext.jsx | AuthProvider + useAuth hook |
| 路由守衛 | frontend/src/components/ProtectedRoute.jsx | 未登入導向 /login |
| 登入頁 | frontend/src/pages/LoginPage.jsx | 登入/註冊 Tab 切換 |
| 管理員頁 | frontend/src/pages/AdminPage.jsx | 用戶列表 + 核准/停用 |

## 開發進度

### 當前階段：Phase 1 - 核心功能（完成）

- [x] 專案骨架與目錄結構
- [x] Chrome Extension（蝦皮擷取 + Dcard 輔助）
- [x] 後端 API 骨架（FastAPI + DB + Alembic）
- [x] 文章生成服務（LLM Mock + 圖片標記）
- [x] 圖片服務（下載備份 + ZIP 打包）
- [x] SEO 分析服務（8 項評分引擎 + 自動分析 + 前端面板）
- [x] 前端 Web UI（Dashboard + Products + Articles + Settings）
- [ ] Chrome Extension 開發 Skill

### Phase 2 - 功能完善

- [ ] Dcard 自動發文（content-dcard.js 自動插入圖片）
- [x] Prompt 範本系統（內建好物推薦文範本 + 前端管理介面）
- [x] 多模型支援（Gemini Flash/Pro/3Pro + Claude Sonnet/Haiku）
- [x] 費用追蹤頁面（按模型分組 + 30天趨勢圖）
- [x] 用量追蹤 Bug 修復（usage_tracker.track → record_usage）
- [x] LLM 多模態圖片輸入（附圖給 LLM 分析商品規格/成分/尺寸）
- [x] 商品網址手動編輯 + LLM 正確對應連結
- [ ] 批量生成功能
- [ ] Chrome Extension icon 美化（設計正式 logo）

### Phase 3 - 雲端部署（完成）

架構：Firebase Hosting + Cloud Run + Supabase PostgreSQL（全免費）

- [x] 後端容器化（Dockerfile + .dockerignore）
- [x] config.py 新增 ENVIRONMENT / ALLOWED_ORIGINS
- [x] database.py 支援 SQLite / PostgreSQL 雙模式
- [x] main.py CORS 改用環境變數
- [x] alembic env.py 從環境變數讀 DATABASE_URL
- [x] requirements.txt 新增 psycopg2-binary + gunicorn
- [x] .env.example 更新生產環境範例
- [x] firebase.json（Hosting + Cloud Run rewrite）
- [x] 圖片下載端點生產環境防護
- [x] Firebase Hosting 部署（https://dcard-auto.web.app）
- [x] Chrome Extension 雲端/本地 API 切換
- [x] 測試人員使用說明頁面（/guide）
- [x] Supabase 資料庫設定 + Alembic 遷移
- [x] Cloud Run 部署 + 環境變數注入
- [x] CORS 限制為 Firebase 域名

### Phase 4 - 多用戶帳號系統（完成）

- [x] 用戶模型（users 表 + user_id FK 到 products/articles/prompts）
- [x] JWT 認證系統（PyJWT + bcrypt，Access 24h / Refresh 7d）
- [x] 登入/註冊 API + Refresh Token
- [x] 前端登入頁面 + AuthContext + 路由守衛
- [x] 所有 API 端點加認證 + user_id 資料隔離
- [x] is_approved 機制（未核准禁用 LLM 功能）
- [x] 管理員 API（用戶列表 / 核准 / 撤回 / 停用）
- [x] 管理員前端頁面（用戶管理 + 核准/停用操作）
- [x] user_id 傳遞鏈：API → Service → Usage Tracker
- [x] 前端 axios interceptor（自動帶 token + 401 自動 refresh）
- [x] 管理員全站費用總覽（/api/admin/usage + 前端切換 tab）
- [x] Phase 4 部署到 Cloud Run + Supabase（Migration PostgreSQL 相容修復）

## 關鍵檔案快速索引

- 進入點（後端）：backend/app/main.py
- 進入點（前端）：frontend/src/main.jsx
- 設定檔：backend/app/config.py + backend/.env
- API 路由：backend/app/api/
- DB 模型：backend/app/models/
- Extension 設定：chrome-extension/manifest.json
- 參考來源：/Users/angrydragon/project/shoppe_autovideo/chrome-extension/
