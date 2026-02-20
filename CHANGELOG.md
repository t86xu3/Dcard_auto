# Changelog

## v1.0.0 (2026-02-21)

首次正式版本，涵蓋完整的 Dcard 文章自動生成流程。

### 核心功能
- Chrome Extension 蝦皮商品擷取（三層腳本架構：injected → content → background）
- LLM 文章生成（Gemini + Claude 雙供應商，支援多模態圖片輸入）
- SEO 8 項評分引擎 + LLM 自動優化（強制使用 gemini-2.5-flash 節省成本）
- Dcard 發文輔助（content-dcard.js 偵測編輯器）

### Prompt 範本系統
- 範本 1：Dcard 好物推薦文（7 段式結構）
- 範本 2：Google 排名衝刺版（基於 9 篇 Google 首頁文章逆向工程）
- SYSTEM_INSTRUCTIONS 系統層級指示（格式規則、圖片插入、語言規範等）
- 前端範本管理介面（新增/編輯/刪除/設為預設）

### 多用戶帳號系統
- JWT 認證（PyJWT + bcrypt，Access 24h / Refresh 7d）
- 管理員核准機制（is_approved 才能使用 LLM）
- 用戶資料隔離（商品/文章/範本依 user_id 分離）
- 管理員頁面：用戶管理 + 系統提示詞檢視

### 費用追蹤
- 多供應商/多模型用量統計（Gemini + Claude）
- 30 天趨勢圖 + 管理員全站總覽
- 按模型分組的費用計算

### 部署架構
- Firebase Hosting（前端靜態檔 + CDN）
- Cloud Run（後端 FastAPI 容器化）
- Supabase PostgreSQL（生產資料庫）
- 全免費額度運行

### UI/UX
- 全站按鈕 emoji 圖標 + active:scale-95 點擊回饋
- 自訂 Dcard 風格 favicon + 標題
- SEO 分析面板（環形分數圖 + 8 項進度條）
