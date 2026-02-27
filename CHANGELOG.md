# Changelog

## v1.4.0 (2026-02-28)

競品搜尋精準度大幅提升 + 系統提示詞用戶控制 + 商品探索自動填滿。

### 新功能
- 系統提示詞開關：設定頁可停用 SYSTEM_INSTRUCTIONS / SEO 優化提示詞
- 商品探索自動填滿：篩選後不足 20 筆自動抓下一頁（最多 10 頁）
- 商品探索新增「銷量+佣金」複合排序選項
- SYSTEM_INSTRUCTIONS 新增 SEO 最佳化規則（關鍵字策略、FAQ 結構、內容結構、可讀性）
- 蝦皮競品搜尋功能（LLM 關鍵字提取 + 競品分數排名 Top 10 + Modal 展示）
- 商品探索儲存連結（勾選複製面板，最多 5 個 + 已複製標記）
- 文章發佈狀態管理（貼到 Dcard 自動標記已發佈 + 手動狀態切換）

### 優化
- 競品搜尋關鍵字提取 prompt 大幅改進（強制 3 個關鍵字、含品類名詞、5 組正反範例）
- 競品搜尋關鍵字智能 fallback（emoji 過濾 + 垃圾詞清洗 + 中文分詞）
- 競品搜尋關鍵字片段自動補全（子字串匹配，如「嬰兒紙」→「嬰兒紙尿褲」）
- 關鍵字解析支援多格式（編號列表 / 逗號 / 頓號 / 空格分隔）
- 商品探索新增關鍵字相關性過濾（搜尋結果僅保留包含關鍵字的商品）
- 移除商品管理頁 Sub_id 輸入欄位（簡化介面）
- 移除商品探索「列表類型」下拉選單（固定推薦模式）
- 移除儀表板蝦皮聯盟行銷三區塊（精簡首頁）

### 修復
- 競品搜尋確保至少 3 個關鍵字（LLM 不足時 fallback 補足）
- Cloud Run 日誌可見性（logger.info → logger.warning）
- 商品探索佣金率篩選全 Tab 生效
- 蝦皮 API limit 上限修正為 50

## v1.3.0 (2026-02-26)

蝦皮商品探索 + 公告系統 — 快速篩選熱門/高分潤商品，管理員可發佈系統公告。

### 新功能
- 蝦皮商品探索頁面：4 個預設模式（🔥 熱門商品 / 🌱 潛在熱門 / 💰 高分潤 / 🔧 自定義查詢）
- 商品探索篩選：關鍵字、排序、佣金率、銷量、價格、評分、重點賣家、賣家加碼
- 商品探索匯入：一鍵匯入蝦皮聯盟連結到商品管理（建立待擷取 placeholder）
- 載入更多：分頁 append 模式，持續瀏覽更多商品
- 公告系統：管理員新增/編輯/刪除/啟停公告，儀表板即時顯示
- 管理員頁面新增「公告管理」Tab

### 技術細節
- 後端 `explore_products()` 彈性 GraphQL 查詢 + 型別轉換（String → float）+ 後端過濾
- `GET /api/shopee/explore` 端點（14 個 Query 參數）
- 佣金率轉換：API 回傳小數（0.9 = 90%），用戶輸入百分比（5 = 5%），後端自動換算
- Announcement model + Alembic migration + CRUD API
- 前端不走快取（搜尋條件組合多，快取意義不大）

### 修復
- 時區問題修正：前後端時間顯示統一為台北時區（`Asia/Taipei`）

## v1.2.0 (2026-02-26)

一鍵擷取功能 — 匯入聯盟行銷網址後，自動批量擷取所有待擷取商品。

### 新功能
- 一鍵擷取按鈕：自動逐一開啟蝦皮分頁、擷取商品資料、同步後端、關閉分頁
- 進度面板：即時進度條 + 當前/總數 + 成功/失敗統計
- 表格行內狀態：等待中 / 擷取中 / 已擷取 / 逾時 / 失敗
- beforeunload 防護：擷取中離開頁面會警告（擷取在 Extension 背景獨立運行不中斷）
- 重新開啟頁面自動恢復進度顯示

### 技術細節
- content-shopee.js 新增自動擷取模式（`#dcard-auto-capture` hash 偵測）
- background.js 批量擷取狀態機（雙重策略：hash 快速路徑 + 主動 CAPTURE_PRODUCT 輪詢 fallback）
- 每項 2-4 秒隨機延遲，60 秒逾時保護
- Chrome Extension 版本升至 1.2.0

## v1.1.0 (2026-02-25)

Dcard 全自動發文 + 穩定性大幅提升。

### Dcard 全自動發文
- 全自動貼文流程：填標題 → 逐段建構內容 → 自動插入圖片（file input 上傳）
- 圖片逐段建構策略：文字段 → 圖片 → 文字段 → 圖片，位置自然正確
- Lexical 編輯器 state 同步修復：游標改用鍵盤事件、貼完 blur+refocus reconcile
- 圖片上傳等待實際出現在編輯器後再繼續（取代盲等固定時間）
- 隨機延遲模擬人類操作節奏，降低 Cloudflare bot detection 風險
- 一鍵清除 Dcard Cookie（popup 內建按鈕，排解 Cloudflare 503 封鎖）

### 文章生成強化
- 非同步文章生成（背景執行緒 + placeholder + 前端 5 秒輪詢）
- LLM 呼叫重試機制（指數退避 5s/10s/20s，max 3 次，詳細錯誤報告含 traceback）
- Gemini 圖片處理 fallback（400 錯誤 → 過濾無效圖片 → 純文字重試）
- 清除 LLM 自創的假圖片標記（regex 清除殘留 `{{IMAGE:...}}`）
- 動態注入當前年份，避免 LLM 使用舊年份

### 商品管理
- 商品拖拽排序（@dnd-kit，控制文章中商品出現順序）
- 蝦皮聯盟行銷網址批量匯入（placeholder + upsert + 前往擷取）
- 商品網址手動編輯 + LLM 正確對應連結
- 文章生成時填入 Sub_id 追蹤

### 文章管理
- 文章批量選取刪除
- 文章列表重新整理按鈕
- 文章編輯自動同步 content_with_images
- SEO 優化自動更新標題（LLM 輸出解析 + DB 同步）
- SEO 面板折疊（預設收合，點擊展開）

### 範本與權限
- 範本 per-user 隔離（自訂範本私有 + 內建範本僅管理員可改）
- 內建範本可編輯/刪除（移除 is_builtin 限制）
- 標題長度規範統一（全站 20-35 字）

### 管理員
- 管理員費用追蹤新增日期篩選
- 全站總覽顯示每用戶使用量明細

### 效能與 UI
- API 快取層（stale-while-revalidate 策略）+ 路由分割 + 輪詢退避
- Chrome Extension icon 美化（藍色漸層 D 字母 + 橙色通知徽章）
- Popup 顯示版本號 + 下載最新版連結

### 修復
- Extension Service Worker 重啟後 token 遺失（從 storage 還原）
- Dcard 發文頁面 URL 修正為 /new-post?type=classic
- 內文重複貼上（ClipboardEvent 後檢查內容長度）
- SEO 分析圖片計數錯誤 + SEO 優化後圖片標記遺失
- 聯盟網址解析失敗（query string 干擾 path 解析）
- Gemini SDK timeout 單位問題（毫秒 vs 秒）
- Claude API 圖片 media_type 不合法

## v1.0.0 (2026-02-21)

首次正式版本，涵蓋完整的 Dcard 文章自動生成流程。

### 核心功能
- Chrome Extension 蝦皮商品擷取（三層腳本架構：injected → content → background）
- LLM 文章生成（Gemini + Claude 雙供應商，支援多模態圖片輸入）
- 兩階段圖片分析（Claude 附圖時由 Gemini Flash 先讀圖，節省 ~60% 成本）
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
