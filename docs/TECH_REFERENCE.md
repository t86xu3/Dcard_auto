# 技術參考手冊

> Dcard 自動文章生成系統的完整技術規格、依賴版本、配置細節與內部運作機制。
>
> 上次更新：2026-02-20

---

## 一、後端依賴（Python 3.11）

### 核心框架

| 套件 | 版本 | 用途 |
|------|------|------|
| fastapi | 0.129.0 | Web API 框架 |
| starlette | 0.52.1 | ASGI 底層（FastAPI 依賴） |
| uvicorn | 0.40.0 | ASGI Server（開發 + 生產 Worker） |
| gunicorn | 23.0.0 | 生產環境 Process Manager |
| pydantic | 2.12.5 | 資料驗證 |
| pydantic-settings | 2.12.0 | 環境變數管理（BaseSettings） |

### 資料庫

| 套件 | 版本 | 用途 |
|------|------|------|
| SQLAlchemy | 2.0.46 | ORM（支援 SQLite + PostgreSQL） |
| alembic | 1.18.4 | Schema 遷移管理 |
| psycopg2-binary | 2.9.10 | PostgreSQL 驅動（生產環境） |

### 認證

| 套件 | 版本 | 用途 |
|------|------|------|
| PyJWT | 2.10.1 | JWT Token 簽發/驗證 |
| bcrypt | 5.0.0 | 密碼雜湊 |
| cryptography | 46.0.5 | PyJWT 底層依賴 |

### LLM

| 套件 | 版本 | 用途 |
|------|------|------|
| google-genai | 1.63.0 | Gemini API（新版 SDK） |
| google-generativeai | 0.8.6 | 舊版 SDK（未使用，保留） |
| anthropic | 0.82.0 | Claude API |

### 任務佇列

| 套件 | 版本 | 用途 |
|------|------|------|
| celery | 5.6.2 | 分散式任務佇列 |
| redis | 7.1.1 | Celery broker / result backend |
| kombu | 5.6.2 | Celery 訊息層 |

### HTTP / 其他

| 套件 | 版本 | 用途 |
|------|------|------|
| httpx | 0.28.1 | 非同步 HTTP Client（圖片下載） |
| requests | 2.32.5 | HTTP Client（備用） |
| aiofiles | 25.1.0 | 非同步檔案操作 |
| python-dotenv | 1.2.1 | .env 檔案載入 |
| python-multipart | 0.0.22 | Form 資料解析 |

---

## 二、前端依賴（Node.js）

### 執行時依賴

| 套件 | 版本 | 用途 |
|------|------|------|
| react | ^19.2.0 | UI 框架 |
| react-dom | ^19.2.0 | React DOM 渲染器 |
| react-router-dom | ^7.13.0 | 前端路由（SPA） |
| axios | ^1.13.5 | HTTP Client |

### 開發依賴

| 套件 | 版本 | 用途 |
|------|------|------|
| vite | ^7.3.1 | 建置工具 + Dev Server |
| @vitejs/plugin-react | ^5.1.1 | Vite React 支援 |
| tailwindcss | ^4.1.18 | Utility-first CSS |
| @tailwindcss/vite | ^4.1.18 | Tailwind Vite 插件 |
| eslint | ^9.39.1 | 程式碼品質檢查 |
| eslint-plugin-react-hooks | ^7.0.1 | React Hooks 規則 |
| eslint-plugin-react-refresh | ^0.4.24 | Fast Refresh 規則 |

### 前端 CSS 架構

- Tailwind CSS 4 使用 `@import "tailwindcss"` 而非 `@tailwind` 指令
- 全域 `@layer base` 覆蓋 `button { cursor: pointer }`（Tailwind 4 preflight 會重設為 default）
- 按鈕回饋：`active:scale-95`
- 過渡衝突：`transition-colors` 與 `transition-transform` 互斥，需用 `transition-all` 替代
- inline 元素不支援 `transform`，文字按鈕需加 `inline-block`

---

## 三、環境變數完整參考

### Pydantic Settings 欄位（`backend/app/config.py`）

| 變數 | 類型 | 預設值 | 說明 |
|------|------|--------|------|
| `ENVIRONMENT` | str | `"development"` | 環境（development / production） |
| `ALLOWED_ORIGINS` | str | `"*"` | CORS 允許來源（逗號分隔） |
| `PORT` | int | `8001` | 後端監聽 Port |
| `DATABASE_URL` | str | `"sqlite:///./dcard_auto.db"` | 資料庫連線字串 |
| `GOOGLE_API_KEY` | str | `""` | Gemini API Key |
| `ANTHROPIC_API_KEY` | str | `""` | Claude API Key |
| `LLM_MODEL` | str | `"gemini-2.5-flash"` | 預設 LLM 模型 |
| `LLM_TEMPERATURE` | float | `0.7` | LLM 溫度參數 |
| `LLM_MAX_TOKENS` | int | `16384` | LLM 最大輸出 Token |
| `IMAGES_DIR` | Path | `"./images"` | 商品圖片儲存目錄 |
| `CELERY_BROKER_URL` | str | `"redis://localhost:6379/2"` | Celery Broker（Redis DB 2） |
| `CELERY_RESULT_BACKEND` | str | `"redis://localhost:6379/3"` | Celery Result（Redis DB 3） |
| `CELERY_TASK_TIMEOUT` | int | `300` | 任務逾時秒數 |
| `CELERY_WORKER_CONCURRENCY` | int | `2` | Worker 並行數 |
| `JWT_SECRET_KEY` | str | `"change-me-..."` | JWT 簽名密鑰 |
| `JWT_ACCESS_TOKEN_EXPIRE_HOURS` | int | `24` | Access Token 有效小時 |
| `JWT_REFRESH_TOKEN_EXPIRE_DAYS` | int | `7` | Refresh Token 有效天數 |
| `ADMIN_USERNAME` | str | `"admin"` | 初始管理員帳號 |
| `ADMIN_EMAIL` | str | `"admin@dcard-auto.local"` | 初始管理員信箱 |
| `ADMIN_PASSWORD` | str | `""` | 初始管理員密碼（空值跳過建立） |
| `DEFAULT_FORUM` | str | `"goodthings"` | Dcard 預設看板 |

### 衍生屬性

| 屬性 | 計算方式 |
|------|----------|
| `is_production` | `ENVIRONMENT == "production"` |
| `cors_origins` | `ALLOWED_ORIGINS` 以逗號分割為 list |

---

## 四、JWT 認證系統

### Token 規格

| 項目 | 值 |
|------|-----|
| 演算法 | HS256 |
| Access Token 有效期 | 24 小時 |
| Refresh Token 有效期 | 7 天 |
| Token sub claim | `str(user.id)` |
| Token type claim | `"access"` / `"refresh"` |
| 密碼雜湊 | bcrypt (salt rounds 預設) |
| Token 前端存儲 | `localStorage.accessToken` / `localStorage.refreshToken` |
| OAuth2 Scheme | `OAuth2PasswordBearer(tokenUrl="/api/auth/login")` |

### PyJWT Import 模式

從 python-jose 遷移而來，注意 import 方式：

```python
import jwt
from jwt import InvalidTokenError as JWTError
# jwt.encode() / jwt.decode() 用法與 python-jose 相同
```

### 三層權限依賴注入

```
get_current_user(token, db)
  → 解碼 JWT → 查詢 User → 檢查 is_active
  → get_current_admin(current_user)
      → 檢查 is_admin
  → get_approved_user(current_user)
      → 檢查 is_approved
```

### 前端 Axios Interceptor 行為

1. **Request**：自動附帶 `Authorization: Bearer {accessToken}`
2. **401 Response**：
   - 排除 `/auth/` 開頭的請求
   - 嘗試用 refreshToken 呼叫 `/api/auth/refresh`
   - 成功：更新 localStorage + 重送失敗的請求
   - 失敗：清除 localStorage → `window.location.href = '/login'`
3. **並行 401 處理**：使用 `isRefreshing` flag + `failedQueue` 確保同時只有一個 refresh 請求
4. **API Timeout**：一般請求 30s，LLM 相關（generate / optimize-seo）180s

---

## 五、LLM 服務架構

### 支援模型與定價

#### Google Gemini

| 模型 | Input (USD/1M tokens) | Output (USD/1M tokens) |
|------|----------------------|------------------------|
| `gemini-2.5-flash` | $0.15 | $0.60 |
| `gemini-2.5-pro` | $1.25 | $10.00 |
| `gemini-3-pro-preview` | $2.00 | $12.00 |

**SDK**：`from google import genai`（新版），Client 初始化：`genai.Client(api_key=...)`

**呼叫方式**：
```python
response = client.models.generate_content(
    model=use_model,
    contents=[user_message, *image_parts],
    config=types.GenerateContentConfig(
        system_instruction=system_prompt,
        temperature=0.7,
        max_output_tokens=16384,
    ),
)
```

**多模態圖片**：`types.Part.from_bytes(data=img_bytes, mime_type=mime_type)`

**用量追蹤**：
- `response.usage_metadata.prompt_token_count`（input）
- `response.usage_metadata.candidates_token_count`（output）

#### Anthropic Claude

| 模型 | Input (USD/1M tokens) | Output (USD/1M tokens) |
|------|----------------------|------------------------|
| `claude-sonnet-4-5` | $3.00 | $15.00 |
| `claude-haiku-4-5` | $1.00 | $5.00 |

**SDK**：`import anthropic`，延遲初始化避免未設定 API Key 時報錯

**呼叫方式**：
```python
response = client.messages.create(
    model=use_model,
    max_tokens=16384,
    system=system_prompt,
    messages=[{"role": "user", "content": content}],
)
```

**多模態圖片**：base64 編碼
```python
{"type": "image", "source": {"type": "base64", "media_type": mime_type, "data": base64_str}}
```

**用量追蹤**：
- `response.usage.input_tokens`
- `response.usage.output_tokens`

### 模型路由機制

```python
def is_anthropic_model(model: str) -> bool:
    return model.startswith("claude-")
```

### Prompt 雙層結構

| 層級 | 來源 | 可修改 | 內容 |
|------|------|--------|------|
| SYSTEM_INSTRUCTIONS | 程式碼 (`services/prompts.py`) | 否 | 輸出格式規範、圖片標記規則 |
| 使用者範本 | DB (`prompt_templates` 表) | 是（設定頁管理） | 寫作風格、語氣、看板偏好 |

組合方式：`{SYSTEM_INSTRUCTIONS}\n\n---\n\n以下是使用者的寫作風格範本：\n\n{user_template}`

### 多模態圖片輸入

| 參數 | 說明 |
|------|------|
| `include_images` | `True` 啟用圖片輸入 |
| `image_sources` | `["main"]` / `["description"]` / `["main", "description"]` |
| 主圖上限 | 每商品 3 張 |
| 描述圖上限 | 每商品 5 張 |
| 下載 timeout | 10 秒（httpx） |

### Markdown 清除

所有 LLM 輸出經 `strip_markdown()` 處理後存入 DB（Dcard 不支援 Markdown）：
- 移除 `#` 標題符號
- 移除 `**粗體**`、`__粗體__`
- 移除 `*斜體*`（保留 emoji 旁的 `*`）
- 移除 `- ` 列表符號（保留 `---` 分隔線）
- 保留 `{{IMAGE:...}}` 標記不動

### 費用換算

| 參數 | 值 |
|------|-----|
| USD → TWD 匯率 | 32.5（硬編碼） |
| 計算公式 | `(tokens / 1,000,000) * price_per_million` |

---

## 六、SEO 評分引擎

### 8 項指標與權重（總分 100）

| 指標 | 權重 | 滿分條件 |
|------|------|----------|
| 標題 SEO | 15 | 20-35 字 + 含關鍵字 |
| 關鍵字密度 | 20 | 1-2%（字元佔比） |
| 關鍵字分佈 | 15 | 首段 100 字含關鍵字 + 4 等分均勻 |
| 內容結構 | 15 | 8-25 段 + 無超長段 + 列表 + 分隔線 |
| 內容長度 | 15 | 1,500-2,500 字 |
| FAQ 結構 | 10 | ≥3 個 Q/A + 明確區塊 |
| 圖片使用 | 5 | ≥3 張圖片 |
| 可讀性 | 5 | 平均句長 15-50 字 + emoji 3-30 個 |

### 等級對照

| 分數 | 等級 |
|------|------|
| ≥ 85 | A |
| ≥ 70 | B |
| ≥ 50 | C |
| < 50 | D |

### 關鍵字提取邏輯

1. 先提取【】內容 → 按標點拆分 → 過濾 2-8 字中文
2. 標題主體拆分 → 提取中文片段
3. 長詞（>4 字）漸進拆分為 2-4 字子詞
4. 過濾停用詞（50+ 個常見虛詞）
5. 最多 10 個關鍵字

### SEO 優化流程

1. 先 `analyze()` 取得現況分數和建議
2. 將分數明細 + 關鍵字 + 建議一起傳入 LLM
3. LLM 輸出優化後的完整文章
4. `strip_markdown()` 清除
5. 再次 `analyze()` 取得優化後分數
6. 回傳 before/after 對比

---

## 七、資料庫模型

### User（users 表）

| 欄位 | 類型 | 約束 | 說明 |
|------|------|------|------|
| id | Integer | PK, index | 自增 ID |
| username | String(50) | unique, not null, index | 帳號 |
| email | String(200) | unique, not null, index | 信箱 |
| hashed_password | String(200) | not null | bcrypt 雜湊 |
| is_active | Boolean | default True | 啟用/停用 |
| is_admin | Boolean | default False | 管理員 |
| is_approved | Boolean | default False | 已核准（可用 LLM） |
| created_at | DateTime | default _taipei_now | 建立時間（UTC+8） |

### Product（products 表）

| 欄位 | 類型 | 約束 | 說明 |
|------|------|------|------|
| id | Integer | PK | 自增 ID |
| user_id | Integer | FK → users.id, index | 擁有者 |
| item_id | String(50) | not null, index | 蝦皮商品 ID |
| shop_id | String(50) | index | 蝦皮店家 ID |
| name | String(500) | not null | 商品名稱 |
| price | Float | | 售價（已除 100000） |
| original_price | Float | | 原價 |
| discount | String(50) | | 折扣描述 |
| description | Text | | 商品描述 |
| images | JSON | | 主圖 URL 陣列 |
| description_images | JSON | | 描述圖 URL 陣列 |
| rating | Float | | 評分（/5.0） |
| sold | Integer | | 已售數量 |
| shop_name | String(200) | | 店家名稱 |
| product_url | String(1000) | | 商品連結 |
| captured_at | DateTime | | 擷取時間 |
| created_at | DateTime | default _taipei_now | 建立時間 |

**組合唯一約束**：`(user_id, item_id)` — 同商品不同用戶可各自擷取

### Article（articles 表）

| 欄位 | 類型 | 約束 | 說明 |
|------|------|------|------|
| id | Integer | PK | 自增 ID |
| user_id | Integer | FK → users.id, index | 擁有者 |
| title | String(500) | not null | 文章標題 |
| content | Text | | 純文字內容 |
| content_with_images | Text | | 含 `{{IMAGE:pid:idx}}` 標記 |
| article_type | String(20) | default "comparison" | comparison / review / seo |
| target_forum | String(50) | default "goodthings" | 目標看板 |
| product_ids | JSON | | 關聯商品 ID 陣列 |
| image_map | JSON | | `{"IMAGE:pid:idx": "url"}` |
| seo_score | Float | | SEO 分數 |
| seo_suggestions | JSON | | SEO 建議列表 |
| status | String(20) | default "draft" | draft / optimized / published |
| published_url | String(1000) | | 發佈後的 Dcard URL |
| created_at | DateTime | default _taipei_now | 建立時間 |
| updated_at | DateTime | onupdate _taipei_now | 更新時間 |

### UsageRecord（usage_records 表）

| 欄位 | 類型 | 約束 | 說明 |
|------|------|------|------|
| id | Integer | PK | 自增 ID |
| provider | String | not null, index | "google" / "anthropic" |
| model | String | not null, index | 模型名稱 |
| user_id | Integer | nullable, index | 用戶 ID |
| usage_date | Date | not null, index | 使用日期 |
| requests | Integer | default 0 | 請求次數 |
| input_tokens | Integer | default 0 | 輸入 Token 數 |
| output_tokens | Integer | default 0 | 輸出 Token 數 |
| created_at | DateTime | default _taipei_now | 建立時間 |
| updated_at | DateTime | onupdate _taipei_now | 更新時間 |

**組合唯一約束**：`(provider, model, usage_date, user_id)` — 每天每用戶每模型一筆累加

### PromptTemplate（prompt_templates 表）

定義於 `backend/app/models/prompt_template.py`，存放使用者的寫作風格範本。

### 其他模型

- **ProductImage**：圖片備份記錄（`backend/app/models/product_image.py`）
- **ApiUsage**：舊版用量模型（`backend/app/models/api_usage.py`），已被 UsageRecord 取代，保留向後相容

### 時區處理

所有 `created_at` / `updated_at` 使用 `_taipei_now()`：
```python
def _taipei_now():
    return datetime.now(timezone(timedelta(hours=8)))
```

---

## 八、Celery 任務佇列

### 配置

| 參數 | 值 | 說明 |
|------|-----|------|
| App 名稱 | `"dcard_auto"` | |
| Broker | Redis DB 2 | 避免與其他專案衝突 |
| Result Backend | Redis DB 3 | 同上 |
| Serializer | JSON | task / accept / result |
| Timezone | Asia/Taipei | UTC 已啟用 |
| Soft Time Limit | 240s (TIMEOUT - 60) | |
| Hard Time Limit | 300s | |
| Worker Concurrency | 2 | 可透過環境變數調整 |
| Prefetch Multiplier | 1 | 減少記憶體使用 |
| Acks Late | True | 任務完成後才確認 |
| Reject on Worker Lost | True | Worker 遺失則拒絕任務 |
| Result Expires | 86400s (1 天) | |
| Broker Retry on Startup | True | |

### 註冊任務

- `app.tasks.article_tasks` — 非同步文章生成

### DB Session 雙模式

| 函數 | 用途 | 模式 |
|------|------|------|
| `get_db()` | FastAPI 依賴注入 | Generator（yield） |
| `get_db_session()` | Celery / 非 FastAPI | Context Manager（with） |

---

## 九、Docker 與部署配置

### Dockerfile（`backend/Dockerfile`）

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
ENV PORT=8080
CMD exec gunicorn app.main:app \
    --bind 0.0.0.0:$PORT \
    --workers 1 \
    --worker-class uvicorn.workers.UvicornWorker \
    --timeout 300
```

| 參數 | 值 | 說明 |
|------|-----|------|
| Base Image | python:3.11-slim | |
| Workers | 1 | 省記憶體（Cloud Run 免費額度） |
| Worker Class | uvicorn.workers.UvicornWorker | ASGI |
| Timeout | 300s | LLM 生成需要較長時間 |
| Port | 8080 | Cloud Run 預設 |

### Firebase Hosting（`firebase.json`）

| 規則 | 目標 |
|------|------|
| `/api/**` | Cloud Run `dcard-auto-backend`（asia-east1） |
| `**` | `/index.html`（SPA fallback） |
| `/assets/**` | `Cache-Control: public, max-age=31536000, immutable` |

**Public 目錄**：`frontend/dist`

### 雲端服務資訊

| 服務 | 說明 |
|------|------|
| Firebase 專案 | `dcard-auto` |
| 前端 URL | https://dcard-auto.web.app |
| Cloud Run | `dcard-auto-backend`（asia-east1） |
| Artifact Registry | `asia-east1-docker.pkg.dev/dcard-auto/cloud-run-source-deploy/dcard-auto-backend` |
| Supabase | ap-southeast-1（Pooler port 6543） |
| Cloud Run 環境變數 | `DATABASE_URL`, `GOOGLE_API_KEY`, `ANTHROPIC_API_KEY`, `ALLOWED_ORIGINS`, `JWT_SECRET_KEY`, `ADMIN_*` |

---

## 十、Vite 開發配置

### `frontend/vite.config.js`

| 項目 | 值 |
|------|-----|
| Plugins | `react()`, `tailwindcss()` |
| Dev Server Port | 3001 |
| API Proxy | `/api` → `http://localhost:8001`（changeOrigin） |

開發時前端 `localhost:3001/api/*` 自動代理到後端 `localhost:8001/api/*`。

---

## 十一、前端路由結構

### App.jsx 路由表

| 路由 | 元件 | 認證 | 說明 |
|------|------|------|------|
| `/login` | LoginPage | 公開 | 登入/註冊 Tab 切換 |
| `/` | DashboardPage | 需認證 | 儀表板 |
| `/products` | ProductsPage | 需認證 | 商品管理 |
| `/articles` | ArticlesPage | 需認證 | 文章管理 |
| `/usage` | UsagePage | 需認證 | API 費用追蹤 |
| `/settings` | SettingsPage | 需認證 | Prompt 範本管理 |
| `/guide` | GuidePage | 需認證 | 使用說明 |
| `/admin` | AdminPage | 需認證 | 用戶管理（管理員） |

### 路由守衛架構

```
BrowserRouter
  └── AuthProvider（Context：user + loading + login/logout/register）
      ├── /login → LoginPage（公開）
      └── ProtectedRoute（檢查 accessToken → 導向 /login）
          └── Layout（側邊欄 + Outlet）
              ├── / → DashboardPage
              ├── /products → ProductsPage
              └── ...
```

### Axios API Client（`frontend/src/api/client.js`）

| 函數 | HTTP | 端點 | Timeout |
|------|------|------|---------|
| `getProducts(skip, limit)` | GET | `/products` | 30s |
| `getProduct(id)` | GET | `/products/{id}` | 30s |
| `updateProduct(id, data)` | PATCH | `/products/{id}` | 30s |
| `deleteProduct(id)` | DELETE | `/products/{id}` | 30s |
| `batchDeleteProducts(ids)` | POST | `/products/batch-delete` | 30s |
| `downloadProductImages(id)` | POST | `/products/{id}/download-images` | 30s |
| `generateArticle(data)` | POST | `/articles/generate` | **180s** |
| `getArticles(skip, limit)` | GET | `/articles` | 30s |
| `getArticle(id)` | GET | `/articles/{id}` | 30s |
| `updateArticle(id, data)` | PUT | `/articles/{id}` | 30s |
| `deleteArticle(id)` | DELETE | `/articles/{id}` | 30s |
| `optimizeSeo(id, model)` | POST | `/articles/{id}/optimize-seo` | **180s** |
| `copyArticle(id)` | GET | `/articles/{id}/copy` | 30s |
| `getArticleImages(id)` | GET | `/articles/{id}/images` | 30s |
| `getPrompts()` | GET | `/prompts` | 30s |
| `createPrompt(data)` | POST | `/prompts` | 30s |
| `updatePrompt(id, data)` | PUT | `/prompts/{id}` | 30s |
| `deletePrompt(id)` | DELETE | `/prompts/{id}` | 30s |
| `setDefaultPrompt(id)` | POST | `/prompts/{id}/set-default` | 30s |
| `analyzeSeo(data)` | POST | `/seo/analyze` | 30s |
| `analyzeSeoById(articleId)` | POST | `/seo/analyze/{id}` | 30s |
| `getUsage()` | GET | `/usage` | 30s |
| `getAdminUsage()` | GET | `/admin/usage` | 30s |
| `getSystemPrompts()` | GET | `/admin/system-prompts` | 30s |

---

## 十二、Chrome Extension

### Manifest V3 配置

| 項目 | 值 |
|------|-----|
| manifest_version | 3 |
| name | Dcard 文章生成器 |
| version | 1.0.0 |
| permissions | `storage`, `activeTab`, `clipboardWrite` |

### Host Permissions

| 網域 | 用途 |
|------|------|
| `https://shopee.tw/*` | 蝦皮商品頁面 |
| `https://*.shopee.tw/*` | 蝦皮子域名 |
| `https://www.dcard.tw/*` | Dcard 發文頁面 |
| `http://localhost:*/*` | 開發環境 Web UI |
| `http://127.0.0.1:*/*` | 開發環境 Web UI |
| `https://dcard-auto.web.app/*` | 生產環境 Web UI |
| `https://dcard-auto.firebaseapp.com/*` | Firebase 備用域名 |

### Externally Connectable

允許以下網頁透過 `chrome.runtime.sendMessage()` 與 Extension 通訊：
- `http://localhost:*/*`
- `http://127.0.0.1:*/*`
- `https://dcard-auto.web.app/*`
- `https://dcard-auto.firebaseapp.com/*`

### Content Scripts 注入時機

| 腳本 | 匹配網域 | run_at | 執行環境 |
|------|----------|--------|----------|
| `content-shopee.js` | `shopee.tw` | document_start | 隔離環境（Content Script） |
| `content-dcard.js` | `www.dcard.tw` | document_end | 隔離環境 |
| `content-webui.js` | `localhost` / `dcard-auto.web.app` | document_end | 隔離環境 |

### Web Accessible Resources

| 資源 | 可存取網域 | 用途 |
|------|-----------|------|
| `injected.js` | `shopee.tw` | 注入頁面上下文攔截 fetch/XHR |

### 三層腳本通訊流程

```
蝦皮頁面上下文（injected.js）
    │ window.postMessage
    ▼
Content Script（content-shopee.js）
    │ chrome.runtime.sendMessage
    ▼
Service Worker（background.js）
    │ chrome.storage / fetch → 後端 API
    ▼
後端 FastAPI
```

### 攔截的蝦皮 API 端點

| Pattern | 說明 |
|---------|------|
| `/api/v*/item/get` | 商品詳情 |
| `/api/v*/pdp/get_pc` | PC 版商品頁 |
| `/api/v*/pdp/get` | 通用商品頁 |
| `/api/v*/item_detail` | 商品詳細資訊 |

---

## 十三、FastAPI 應用結構

### 啟動生命週期（lifespan）

1. `create_tables()` — 建立所有資料表
2. 建立圖片目錄（僅開發環境）
3. `seed_default_prompts(db)` — 內建 Prompt 範本
4. `_seed_admin_user()` — 初始管理員帳號（依據 `ADMIN_*` 環境變數）

### Router 註冊

| 前綴 | Router | Tags |
|------|--------|------|
| `/api/auth` | auth_api | 認證 |
| `/api/admin` | admin_api | 管理員 |
| `/api/products` | products | 商品管理 |
| `/api/articles` | articles | 文章管理 |
| `/api/seo` | seo | SEO 分析 |
| `/api/usage` | usage | 使用量統計 |
| `/api/prompts` | prompts | Prompt 範本 |

### Middleware

- **CORS**：`allow_origins` 依環境變數，`allow_credentials=True`，`allow_methods=["*"]`，`allow_headers=["*"]`
- **Static Files**：僅開發環境掛載 `/images` 目錄

### 健康檢查

| 端點 | 回應 |
|------|------|
| `GET /` | `{"status": "ok", "message": "..."}` |
| `GET /health` | `{"status": "healthy"}` |

### 服務單例

以下服務在模組層級實例化，直接 import 使用：
- `llm_service = LLMService()`（`services/llm_service.py`）
- `seo_service = SeoService()`（`services/seo_service.py`）
- `usage_tracker = UsageTracker()`（`services/usage_tracker.py`）

---

## 十四、圖片處理流程

### 資料流

```
蝦皮 API 攔截
    │ images: [CDN URL, ...]
    │ description_images: [CDN URL, ...]
    ▼
Product 模型（JSON 欄位存 URL 陣列）
    │
    ├── 下載備份（可選）
    │   POST /api/products/{id}/download-images
    │   → backend/images/{product_id}/image_{index}.jpg
    │
    ├── 多模態 LLM 輸入（可選）
    │   include_images=True → httpx 下載 → bytes/base64 → LLM
    │   主圖 max 3 + 描述圖 max 5
    │
    └── 文章內圖片標記
        LLM 插入 {{IMAGE:product_id:index}}
        → 後端替換為實際 CDN URL
        → content_with_images 欄位
```

### 匯出選項

1. **複製到剪貼簿**：`GET /api/articles/{id}/copy` → Dcard 格式化純文字
2. **下載圖片 ZIP**：`GET /api/articles/{id}/images/download` → 打包所有關聯圖片
3. **Dcard 自動插入**：`content-dcard.js`（Phase 2 待開發）

---

## 十五、SQLAlchemy 雙模式引擎

### SQLite（開發）

```python
engine = create_engine("sqlite:///./dcard_auto.db", connect_args={"check_same_thread": False}, pool_pre_ping=True)
```

### PostgreSQL（生產 Supabase）

```python
engine = create_engine("postgresql://...", pool_pre_ping=True)
```

`pool_pre_ping=True` 處理 Supabase 閒置自動斷線問題。

### Alembic Migration 注意

| 情境 | 注意事項 |
|------|----------|
| SQLite 修改既有表 | 必須用 `op.batch_alter_table()` 包裹 |
| PostgreSQL INSERT boolean | 必須用 `bindparams(is_active=True)`，不可用 `1`/`0` |
| 雙 DB 驗證 | 先本地 SQLite `alembic current`，再 `DATABASE_URL=... alembic upgrade head` 跑 Supabase |

---

## 十六、Port 分配

| 服務 | Port | 說明 |
|------|------|------|
| FastAPI（開發） | 8001 | 避免與 shoppe_autovideo (8000) 衝突 |
| Vite Dev Server | 3001 | 避免與 shoppe_autovideo (3000) 衝突 |
| Cloud Run | 8080 | Cloud Run 預設 |
| Redis | 6379 | 預設（DB 2 = Broker, DB 3 = Result） |
