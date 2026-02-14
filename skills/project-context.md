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
| LLM | Gemini API | 免費額度高、中文表現好 |
| 資料庫 | SQLite→PostgreSQL | 開發簡便、生產可擴展 |
| 圖片策略 | 蝦皮 URL + 本地備份 | 平衡簡便性與穩定性 |
| Dcard 發文 | 先手動後自動 | 降低初期複雜度，符合 ToS |
| Port | 8001 (後端) / 3001 (前端) | 避免與 shoppe_autovideo 衝突 |

### 踩過的坑

| 問題 | 症狀 | 解法 |
|------|------|------|
| 蝦皮價格格式 | 顯示為 10 萬+ | API 價格需除以 100000 |
| Manifest V3 Blob | Service Worker 無法用 Blob | 改用 Data URL + base64 |
| Dcard 無公開發文 API | 無法直接 POST 發文 | 改用 content script 模擬輸入 |

---

## 用戶習慣

### 工作流程偏好
- 先規劃後實作（Plan Mode）
- 每步驟確認後再繼續
- 重視文檔同步

### 溝通偏好
- 繁體中文
- 簡潔明瞭
- 用表格整理資訊

### 程式碼偏好
- 模組化、關注點分離
- 雲端擴展優先
- 漸進式開發（先手動再自動）

---

## 更新日誌

| 日期 | 更新內容 |
|------|----------|
| 2026-02-14 | 初始建立，規劃 Phase 1 架構 |
