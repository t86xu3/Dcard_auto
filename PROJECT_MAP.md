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
| 資料庫 | SQLite → PostgreSQL | - | 開發/生產 |
| LLM | Google Gemini API | latest | 文章生成 + SEO 優化 |
| 前端框架 | React + Vite | 19 / 6 | Web UI |
| CSS | Tailwind CSS | 4 | 樣式 |
| 擴充功能 | Chrome Manifest V3 | - | 商品擷取 + Dcard 輔助發文 |

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
│   │   │   ├── product.py     # 商品模型
│   │   │   ├── product_image.py # 圖片備份模型
│   │   │   ├── article.py     # 文章模型
│   │   │   └── api_usage.py   # API 用量追蹤
│   │   ├── api/
│   │   │   ├── products.py    # 商品 CRUD
│   │   │   ├── articles.py    # 文章生成/管理
│   │   │   ├── seo.py         # SEO 分析/優化
│   │   │   └── usage.py       # 用量統計
│   │   ├── services/
│   │   │   ├── llm_service.py # Gemini 文章生成
│   │   │   ├── seo_service.py # SEO 分析與優化
│   │   │   ├── image_service.py # 圖片下載、備份、打包
│   │   │   └── usage_tracker.py
│   │   └── tasks/
│   │       └── article_tasks.py # Celery 非同步任務
│   ├── alembic/               # DB 遷移
│   ├── images/                # 下載的商品圖片
│   ├── requirements.txt
│   ├── .env.example
│   └── start.sh
│
├── frontend/
│   ├── src/
│   │   ├── api/               # API 客戶端
│   │   ├── components/        # 共用元件
│   │   ├── pages/
│   │   │   ├── DashboardPage.jsx
│   │   │   ├── ProductsPage.jsx
│   │   │   ├── ArticlesPage.jsx   # 文章管理
│   │   │   └── SettingsPage.jsx
│   │   └── hooks/
│   │       └── useExtensionDetect.js
│   ├── package.json
│   └── vite.config.js
│
├── docs/                      # 詳細設計文檔
│   └── IMPLEMENTATION_PLAN.md
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
| 商品 API | backend/app/api/products.py | 商品 CRUD + 圖片下載 |
| 文章生成 API | backend/app/api/articles.py | 比較文/開箱文生成 |
| SEO 分析 API | backend/app/api/seo.py | SEO 評分與優化建議 |
| LLM 服務 | backend/app/services/llm_service.py | Gemini 文章生成 |
| SEO 服務 | backend/app/services/seo_service.py | SEO 分析與自動優化 |
| 圖片服務 | backend/app/services/image_service.py | 圖片下載、備份、打包 ZIP |
| 文章任務 | backend/app/tasks/article_tasks.py | Celery 非同步生成 |
| 儀表板 | frontend/src/pages/DashboardPage.jsx | 系統概覽 |
| 商品管理 | frontend/src/pages/ProductsPage.jsx | 商品列表與操作 |
| 文章管理 | frontend/src/pages/ArticlesPage.jsx | 文章編輯與發佈 |
| Extension 偵測 | frontend/src/hooks/useExtensionDetect.js | 自動偵測插件 |

## 開發進度

### 當前階段：Phase 1 - 核心功能（完成）

- [x] 專案骨架與目錄結構
- [x] Chrome Extension（蝦皮擷取 + Dcard 輔助）
- [x] 後端 API 骨架（FastAPI + DB + Alembic）
- [x] 文章生成服務（LLM Mock + 圖片標記）
- [x] 圖片服務（下載備份 + ZIP 打包）
- [x] SEO 分析服務（純演算法）
- [x] 前端 Web UI（Dashboard + Products + Articles + Settings）
- [ ] Chrome Extension 開發 Skill

### Phase 2 - 功能完善（待定）

- [ ] Dcard 自動發文（content-dcard.js 自動插入圖片）
- [ ] 文章模板系統（不同看板格式）
- [ ] 批量生成功能
- [ ] Docker 部署配置
- [ ] 雲端部署（AWS/GCP）
- [ ] Chrome Extension icon 美化（設計正式 logo）

## 關鍵檔案快速索引

- 進入點（後端）：backend/app/main.py
- 進入點（前端）：frontend/src/main.jsx
- 設定檔：backend/app/config.py + backend/.env
- API 路由：backend/app/api/
- DB 模型：backend/app/models/
- Extension 設定：chrome-extension/manifest.json
- 參考來源：/Users/angrydragon/project/shoppe_autovideo/chrome-extension/
