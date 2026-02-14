# 實作計畫

## Context

基於 shoppe_autovideo 的 Chrome Extension 架構，建立 Dcard_auto 專案。
目標：蝦皮商品擷取 → LLM 比較文/開箱文 → SEO 優化 → Dcard 發佈。

---

## Step 1: 專案初始化

### 1.1 Git 初始化
```bash
cd /Users/angrydragon/project/Dcard_auto
git init
```

### 1.2 建立 .gitignore
```
# Python
venv/
__pycache__/
*.pyc
*.db

# Node
node_modules/
dist/

# Environment
.env
*.key
*.pem

# Images
backend/images/

# IDE
.vscode/
.idea/
```

---

## Step 2: Chrome Extension

### 2.1 從 shoppe_autovideo 複製的檔案

| 來源 | 目標 | 修改程度 |
|------|------|----------|
| `injected.js` | `injected.js` | 不變（蝦皮 API 攔截通用） |
| `content.js` | `content-shopee.js` | 重新命名，邏輯保留 |
| `content-webui.js` | `content-webui.js` | 不變 |
| `background.js` | `background.js` | 大幅改造（新增文章訊息類型） |
| `popup.*` | `popup.*` | 大幅改造（新增文章生成功能） |
| `icons/` | `icons/` | 替換為新圖標 |

### 2.2 新建檔案

**content-dcard.js** — Dcard 發文輔助
```
功能：
- 偵測 Dcard 發文頁面（URL: dcard.tw/f/*/new）
- 監聽 background.js 的 PASTE_ARTICLE 訊息
- 找到 Dcard 標題輸入框，填入文章標題
- 找到 Dcard 內容編輯器，填入文章內容
- Phase 1：提供浮動按鈕「貼上文章」
- Phase 1：圖片位置以 [📸 圖片: 描述] 標記
- Phase 2：自動上傳圖片到 Dcard 編輯器
```

**manifest.json** — 雙站點配置
```json
{
  "manifest_version": 3,
  "name": "Dcard 自動文章生成器",
  "version": "1.0.0",
  "description": "擷取蝦皮商品，自動生成 Dcard 比較文與 SEO 優化文章",
  "content_scripts": [
    {
      "matches": ["https://shopee.tw/*", "https://*.shopee.tw/*"],
      "js": ["content-shopee.js"],
      "run_at": "document_start"
    },
    {
      "matches": ["https://www.dcard.tw/*"],
      "js": ["content-dcard.js"],
      "run_at": "document_end"
    },
    {
      "matches": ["http://localhost:*/*", "http://127.0.0.1:*/*"],
      "js": ["content-webui.js"],
      "run_at": "document_end"
    }
  ],
  "host_permissions": [
    "https://shopee.tw/*",
    "https://*.shopee.tw/*",
    "https://www.dcard.tw/*",
    "http://localhost:*/*",
    "http://127.0.0.1:*/*"
  ],
  "permissions": ["storage", "activeTab", "clipboardWrite"],
  "externally_connectable": {
    "matches": ["http://localhost:*/*", "http://127.0.0.1:*/*"]
  },
  "background": { "service_worker": "background.js" },
  "action": {
    "default_popup": "popup.html",
    "default_icon": { "16": "icons/icon16.png", "48": "icons/icon48.png" },
    "default_title": "Dcard 自動文章生成器"
  },
  "web_accessible_resources": [
    {
      "resources": ["injected.js"],
      "matches": ["https://shopee.tw/*", "https://*.shopee.tw/*"]
    }
  ]
}
```

### 2.3 background.js 新增訊息類型

| 訊息類型 | 方向 | 說明 |
|---------|------|------|
| `PRODUCT_DATA` | content-shopee → background | 儲存商品（保留） |
| `GET_PRODUCTS` | popup → background | 取得商品列表（保留） |
| `CLEAR_PRODUCTS` | popup → background | 清除商品（保留） |
| `DELETE_PRODUCT` | popup → background | 刪除商品（保留） |
| `SYNC_ALL_TO_BACKEND` | popup → background | 同步後端（保留） |
| `GENERATE_ARTICLE` | popup → background | 呼叫後端生成文章（新增） |
| `GET_ARTICLES` | popup → background | 取得文章列表（新增） |
| `COPY_ARTICLE` | popup → background | 複製文章到剪貼簿（新增） |
| `PASTE_TO_DCARD` | popup → background → content-dcard | 貼上到 Dcard（新增） |

### 2.4 Popup 改造

新增頁面切換（Tab 設計）：
- **擷取** Tab：商品擷取按鈕 + 商品列表（保留原有）
- **文章** Tab：
  - 選擇商品（勾選比較對象）
  - 選擇文章類型（比較文/開箱文/SEO）
  - 選擇目標看板
  - 「生成文章」按鈕
  - 文章預覽
  - 「複製」/「前往 Dcard 發文」按鈕

---

## Step 3: 後端

### 3.1 初始化

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install fastapi uvicorn sqlalchemy alembic celery redis pydantic-settings google-generativeai httpx aiofiles python-multipart
pip freeze > requirements.txt
alembic init alembic
```

### 3.2 config.py

```python
from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    # Database
    DATABASE_URL: str = "sqlite:///./dcard_auto.db"

    # LLM
    GOOGLE_API_KEY: str = ""
    LLM_MODEL: str = "gemini-2.5-flash"

    # Celery
    CELERY_BROKER_URL: str = "redis://localhost:6379/2"  # 用不同 DB 避免衝突
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/3"

    # Paths
    IMAGES_DIR: Path = Path("./images")

    # Server
    API_PORT: int = 8001

    class Config:
        env_file = ".env"

settings = Settings()
```

### 3.3 模型定義

**Product** — 與 shoppe_autovideo 格式相容
**ProductImage** — 下載到本地的圖片記錄
**Article** — 核心文章模型
  - `content`: 純文字內容（可編輯）
  - `content_with_images`: 含圖片標記的完整版
  - `image_map`: JSON 映射 `{"img_1": {"product_id": 1, "index": 0, "url": "..."}}`
  - `article_type`: comparison / review / seo
  - `target_forum`: Dcard 目標看板
  - `seo_score`: 0-100 SEO 評分
  - `status`: draft → optimized → published

### 3.4 LLM Service 文章生成

**Prompt 設計原則：**
1. 提供完整商品資訊（名稱、價格、評分、銷量、描述）
2. 指定文章類型和目標看板風格
3. 要求在適當位置插入 `{{IMAGE:product_id:index}}` 標記
4. 要求自然的 Dcard 口語化風格
5. SEO 類型額外要求關鍵字佈局

**比較文 Prompt 範例：**
```
你是一位 Dcard 的資深好物分享達人。
請根據以下商品資訊，撰寫一篇自然、口語化的比較文。

商品資訊：
{products_json}

要求：
1. 標題要有吸引力，適合 {target_forum} 看板
2. 開頭用 1-2 句引起共鳴（如「最近在找OO，比較了好幾款...」）
3. 每個商品用獨立段落介紹，自然插入優缺點
4. 在適當位置插入圖片標記 {{IMAGE:商品ID:圖片索引}}
5. 結尾給出推薦結論
6. 語氣自然親切，像在跟朋友分享
7. 全文 800-1500 字
```

### 3.5 SEO Service

**分析項目：**
| 項目 | 權重 | 計算方式 |
|------|------|----------|
| 標題長度 | 15% | 15-30 字最佳 |
| 關鍵字密度 | 20% | 1%-3% 為最佳 |
| 段落結構 | 15% | 每段 100-300 字 |
| 小標題使用 | 10% | 至少 3 個小標 |
| 圖片描述 | 10% | 圖片需有說明文字 |
| 內部連結 | 10% | 相關產品連結 |
| 首段關鍵字 | 10% | 前 100 字含關鍵字 |
| 文章長度 | 10% | 800+ 字 |

**優化功能：**
- 自動改寫標題（更吸引點擊）
- 調整關鍵字密度
- 補充圖片描述文字
- 建議增加的小標題

### 3.6 圖片服務

**下載流程：**
```python
async def download_product_images(product_id: int):
    product = get_product(product_id)
    save_dir = IMAGES_DIR / str(product_id)
    save_dir.mkdir(parents=True, exist_ok=True)

    for i, url in enumerate(product.images):
        path = save_dir / f"main_{i}.jpg"
        await download_image(url, path)
        save_image_record(product_id, url, path, "main")

    for i, url in enumerate(product.description_images):
        path = save_dir / f"desc_{i}.jpg"
        await download_image(url, path)
        save_image_record(product_id, url, path, "description")
```

**ZIP 打包：**
- 收集文章中所有 `{{IMAGE:...}}` 標記對應的圖片
- 打包為 ZIP，檔名含圖片位置說明
- 提供下載端點

---

## Step 4: 前端 Web UI

### 4.1 初始化

```bash
cd frontend
npm create vite@latest . -- --template react
npm install axios react-router-dom
npm install -D tailwindcss @tailwindcss/vite
```

### 4.2 頁面規劃

**DashboardPage** — 儀表板
- 商品數量、文章數量統計
- API 用量追蹤
- 最近生成的文章
- Extension 偵測

**ProductsPage** — 商品管理
- 商品列表（圖片、名稱、價格、評分）
- 批量選擇（用於生成比較文）
- 「生成比較文」按鈕（選擇多個商品後）
- 「下載圖片」按鈕

**ArticlesPage** — 文章管理
- 文章列表（標題、類型、看板、SEO 分數、狀態）
- 文章編輯器（即時預覽含圖片）
- 「SEO 優化」按鈕
- 「複製到剪貼簿」按鈕
- 「前往 Dcard 發文」按鈕
- 圖片下載（ZIP）

**SettingsPage** — 設定
- LLM 設定（模型、溫度）
- 預設看板
- 文章風格偏好

---

## Step 5: Chrome Extension Skill

在 `~/One_piece/skills/` 建立 `chrome-extension-dev.md`。

**內容大綱：**

1. **Manifest V3 模板** — 標準配置，含權限、content scripts、web_accessible_resources
2. **三層腳本模式** — injected（攔截）→ content（中繼）→ background（處理）
3. **訊息傳遞 Pattern** — postMessage / chrome.runtime.sendMessage / onMessageExternal
4. **後端同步 Pattern** — 自動同步 + 手動批量同步 + graceful fallback
5. **Web UI 偵測** — broadcast + localStorage + PING/PONG
6. **Popup 最佳實踐** — 按鈕狀態管理、Toast、空狀態、列表渲染
7. **常見踩坑** — Service Worker Blob 限制、跨域問題、message channel 關閉

---

## 驗證清單

- [ ] Chrome Extension 載入成功，前往蝦皮擷取商品
- [ ] 後端 `http://localhost:8001/docs` 可訪問
- [ ] POST `/api/articles/generate` 生成比較文
- [ ] 文章中正確插入圖片標記
- [ ] POST `/api/seo/analyze` 回傳 SEO 分數
- [ ] 下載圖片 ZIP 正常
- [ ] 前端 `http://localhost:3001` 正常載入
- [ ] Dcard 頁面 content-dcard.js 載入成功
- [ ] 複製到剪貼簿功能正常
