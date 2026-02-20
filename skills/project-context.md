# Project Context Skill

> 專案上下文守護者 - 確保文檔一致性、記錄操作風格、追蹤技術決策

## 觸發條件

- 專案初始化時（/init）
- 新增功能/重構完成後
- /learning 執行後

## 執行內容

### 1. 文檔同步檢查

每次觸發時，檢查以下文檔是否與實際狀態一致：

| 文檔 | 檢查項目 |
|------|----------|
| `PROJECT_MAP.md` | 開發進度、核心模組索引、目錄結構 |
| `CLAUDE.md` | 當前工作、技術決策、已知問題 |
| `docs/TECH_REFERENCE.md` | 依賴版本、環境變數、DB Schema、LLM 定價 |

若發現不一致，主動提醒用戶更新。

### 2. 操作風格更新

發現新的操作模式時，更新下方區塊。

---

## 專案操作風格

### 命名規範
- 變數/函數：snake_case（Python）、camelCase（JavaScript）
- 元件/類別：PascalCase
- 資料庫表：snake_case
- API 路由：kebab-case

### Commit 風格
- 語言：繁體中文
- 格式：`類型: 描述`
- 範例：`功能: 新增文章生成 API`、`修復: SEO 分析分數計算錯誤`

### 分支策略
- 主分支：main
- 功能分支：feature/xxx

### 測試策略
- 後端：pytest + FastAPI TestClient
- 前端：Playwright Web UI 測試
- Extension：手動測試 + Chrome DevTools

---

## 技術偏好與決策記錄

### 為何用這個方案

| 決策 | 選擇 | 原因 |
|------|------|------|
| 蝦皮攔截架構 | 複用 shoppe_autovideo | 已驗證穩定的三層腳本模式 |
| 後端框架 | FastAPI | 與現有專案一致、async 支援佳 |
| LLM | Gemini + Claude 雙供應商 | Gemini 免費額度高；Claude 品質穩定，互為備援 |
| 資料庫 | SQLite→PostgreSQL | 開發簡便、生產可擴展 |
| 圖片策略 | 蝦皮 URL + 本地備份 | 平衡簡便性與穩定性 |
| Dcard 發文 | 先手動後自動 | 降低初期複雜度，符合 ToS |
| Port | 8001 (後端) / 3001 (前端) | 避免與 shoppe_autovideo 衝突 |
| 認證 | PyJWT + bcrypt（從 python-jose 遷移） | python-jose 停止維護，PyJWT 更活躍 |
| 部署 | Firebase Hosting + Cloud Run + Supabase | 全免費額度，asia-east1 低延遲 |
| 按鈕圖標 | emoji 而非圖標庫 | 零依賴、統一風格、Dcard 本身也用 emoji |
| 技術文檔分層 | CLAUDE.md + PROJECT_MAP + TECH_REFERENCE | TECH_REFERENCE 不入 AI 啟動流程，減少 context 浪費 |
| SEO 優化模型 | 強制 gemini-2.5-flash | SEO 改寫不需高階模型，成本從 NT$4→NT$0.13 |
| 範本架構 | V1 好物推薦 + V2 Google 排名衝刺 | V2 基於 9 篇 Google 首頁文章逆向工程 |
| Claude 圖片策略 | 兩階段：Flash 讀圖 → 純文字傳 Claude | Claude 圖片 token 昂貴，Flash 讀圖幾乎免費，節省 ~60% |

### 踩過的坑

| 問題 | 症狀 | 解法 |
|------|------|------|
| 蝦皮價格格式 | 顯示為 10 萬+ | API 價格需除以 100000 |
| Manifest V3 Blob | Service Worker 無法用 Blob | 改用 Data URL + base64 |
| Dcard 無公開發文 API | 無法直接 POST 發文 | 改用 content script 模擬輸入 |
| Tailwind 4 cursor 消失 | 所有 button 失去 pointer 游標 | Tailwind 4 preflight 重設為 default → 全域 `@layer base { button { cursor: pointer } }` |
| Tailwind 4 transition 互斥 | `transition-colors` 覆蓋 `transition-transform` | 需同時用色彩+位移過渡時改用 `transition-all` |
| inline 元素 transform 無效 | `active:scale-95` 對文字連結無效 | 加 `inline-block` |
| SQLite ALTER COLUMN | Alembic migration 報錯 | 用 `op.batch_alter_table()` 包裹 |
| PostgreSQL boolean INSERT | `1`/`0` 在 PG 報型別錯誤 | 用 `bindparams(is_active=True)` |
| python-jose → PyJWT | import 路徑不同 | `import jwt; from jwt import InvalidTokenError as JWTError` |
| Supabase 閒置斷線 | DB 連線隔夜失效 | `pool_pre_ping=True` |

---

## 用戶習慣

### 工作流程偏好
- 先規劃後實作（Plan Mode）
- 大量修改時偏好「自動同意 + 一次 commit push」
- 重視文檔同步（commit 後必須檢查）
- 部署流程：修改 → commit → push → Firebase deploy + Cloud Run deploy

### 溝通偏好
- 繁體中文
- 簡潔明瞭，不要廢話
- 用表格整理資訊
- 斜線指令的 description 用繁體中文

### 程式碼偏好
- 模組化、關注點分離
- 雲端擴展優先
- 漸進式開發（先手動再自動）
- UI 按鈕用 emoji 圖標 + active:scale-95 回饋

---

## 更新日誌

| 日期 | 更新內容 |
|------|----------|
| 2026-02-14 | 初始建立，規劃 Phase 1 架構 |
| 2026-02-20 | 補記 Phase 2-4 技術決策、7 個踩坑紀錄、用戶偏好更新、TECH_REFERENCE 納入同步檢查 |
| 2026-02-21 | 新增 SEO 強制模型決策、雙範本架構決策 |
