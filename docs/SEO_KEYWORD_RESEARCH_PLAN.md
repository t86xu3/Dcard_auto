# SEO 長尾關鍵字研究計畫

> 版本：v1.0 | 建立日期：2026-02-28
> 狀態：研究完成，待實作

## 目錄

1. [現況分析](#1-現況分析)
2. [長尾關鍵字策略理論](#2-長尾關鍵字策略理論)
3. [工具與 API 調研](#3-工具與-api-調研)
4. [關鍵字研究工作流設計](#4-關鍵字研究工作流設計)
5. [系統整合設計](#5-系統整合設計)
6. [實作路線圖](#6-實作路線圖)
7. [實作優先級表](#7-實作優先級表)
8. [成本預估](#8-成本預估)

---

## 1. 現況分析

### 1.1 現有 SEO 實作盤點

目前系統已具備完整的 SEO 評分引擎與優化流程，以下是 8 項評分指標的現況：

| 指標 | 權重 | 現況 | 數據驅動? |
|------|------|------|-----------|
| 標題 SEO | 15% | 格式規範完善（年份+關鍵字+推薦+20-35字） | ❌ 關鍵字憑 LLM 自行判斷 |
| 關鍵字密度 | 20% | 1-2% 密度控制 + 堆砌警告 | ❌ 無搜尋量數據佐證關鍵字選擇 |
| 關鍵字分佈 | 15% | 首段 100 字 + 四等分均勻度 | ❌ 同上 |
| 內容結構 | 15% | 段落數、長度、列表、分隔線 | ✅ 規則明確 |
| 內容長度 | 15% | 3000 字以上深度內容 | ✅ 規則明確 |
| FAQ 結構 | 10% | 5 組 Q&A + 結構化格式 | ❌ FAQ 問題未基於實際搜尋數據 |
| 圖片使用 | 5% | 圖片標記 + 自動替換 | ✅ 規則明確 |
| 可讀性 | 5% | 句長 + emoji 使用頻率 | ✅ 規則明確 |

**結論**：8 項中有 4 項與關鍵字直接相關（標題、密度、分佈、FAQ），但全部缺乏數據支撐。

### 1.2 核心問題：無數據支撐的關鍵字策略

目前的關鍵字處理流程：

```
商品名稱 → LLM 自行判斷 2-3 個關鍵字 → 寫入文章
                                          ↓
                            文章完成後 → _extract_keywords_from_title()
                                          ↓
                                   從標題反推關鍵字 → SEO 評分
```

**問題清單**：

| 問題 | 說明 | 影響 |
|------|------|------|
| 關鍵字選擇無依據 | SYSTEM_INSTRUCTIONS 第 11 項：「從商品名稱和品類**自動判斷** 2-3 個主要關鍵字」，完全仰賴 LLM 直覺 | 可能選了無人搜尋的關鍵字 |
| 事後提取而非事前研究 | `_extract_keywords_from_title()` 在文章生成**後**才從標題拆解關鍵字，用途僅限 SEO 評分 | 無法在生成階段引導 LLM |
| 缺乏搜尋量數據 | 不知道目標關鍵字的月搜尋量、競爭程度 | 無法評估排名潛力 |
| 缺乏 SERP 分析 | 不知道競爭對手（Google 首頁現有文章）的內容特徵 | 難以制定差異化策略 |
| FAQ 問題靠猜測 | SYSTEM_INSTRUCTIONS 要求「Google 常搜問題」，但 LLM 只能猜 | FAQ 可能與真實搜尋意圖脫節 |
| 無長尾展開 | 只有 head term（如「保溫杯」），缺乏長尾變體（如「保溫杯推薦 ptt」「學生保溫杯 500ml」） | 錯失大量長尾流量 |

### 1.3 與 Google 首頁文章的差距

基於現有 V2 範本（逆向工程 9 篇 Google 首頁文章）的觀察：

| 維度 | Google 首頁文章 | 我們目前的做法 | 差距 |
|------|----------------|---------------|------|
| 關鍵字選擇 | 基於搜尋量數據，選 1 個核心 + 3-5 個長尾 | LLM 猜測 2-3 個 | 無數據支撐 |
| 標題設計 | 含搜尋量最高的長尾詞 | 含品類通用詞 | 精準度不足 |
| FAQ 問題 | 來自 People Also Ask (PAA) | LLM 自行編造 | 可能脫節 |
| 內容深度 | 針對搜尋意圖定製 | 通用商品比較 | 缺乏意圖匹配 |
| 語義覆蓋 | 系統性覆蓋相關詞群 | 隨機提及同義詞 | 覆蓋不全面 |

---

## 2. 長尾關鍵字策略理論

### 2.1 Head vs Long-tail 關鍵字

```
搜尋量 ▲
       │ ████
       │ ████ Head terms
       │ ████ (1-2 字，高搜尋量，高競爭)
       │ ████ 例：「保溫杯」
       │ ████████
       │ ████████ Mid-tail
       │ ████████ (2-3 字，中搜尋量，中競爭)
       │ ████████ 例：「保溫杯推薦」
       │ ████████████████████████████████████████████████
       │ Long-tail (3+ 字，低搜尋量，低競爭，高轉換率)
       │ 例：「學生保溫杯 500ml 推薦」「ptt 保溫杯 2026」
       └─────────────────────────────────────────────────────→ 關鍵字數量
```

**關鍵數據**：
- 長尾關鍵字佔所有搜尋流量的 **~70%**
- 長尾關鍵字轉換率是 head terms 的 **2.5 倍**
- 新網站靠長尾關鍵字更容易上首頁（競爭少）

### 2.2 三層展開架構

```
第一層：種子詞（Seed Keywords）
├── 來源：商品名稱、品類
├── 例：「保溫杯」「藍牙耳機」
│
├── 第二層：修飾詞展開（Modifiers）
│   ├── 屬性修飾：品牌、材質、容量、顏色
│   │   例：「象印保溫杯」「不鏽鋼保溫杯」「500ml 保溫杯」
│   ├── 意圖修飾：推薦、評價、比較、怎麼選
│   │   例：「保溫杯推薦」「保溫杯評價」「保溫杯怎麼選」
│   ├── 場景修飾：對象、用途、場合
│   │   例：「學生保溫杯」「辦公室保溫杯」「登山保溫杯」
│   └── 平台修飾：PTT、Dcard、蝦皮
│       例：「保溫杯推薦 ptt」「保溫杯推薦 dcard」
│
└── 第三層：組合長尾（Combined Long-tail）
    ├── 屬性 + 意圖：「象印保溫杯推薦」
    ├── 場景 + 屬性：「學生 500ml 保溫杯」
    ├── 年份 + 意圖：「2026 保溫杯推薦」
    └── 完整長尾：「2026 學生保溫杯推薦 500ml ptt」
```

### 2.3 搜尋意圖分類

| 意圖類型 | 說明 | 關鍵字模式 | 文章對應策略 |
|----------|------|-----------|-------------|
| 資訊型 (Informational) | 想了解知識 | 「XX是什麼」「XX怎麼用」 | 教學/指南型段落 |
| 比較型 (Comparative) | 想比較選擇 | 「XX vs YY」「XX比較」「XX差別」 | 比較表格 + 場景推薦 |
| 商業型 (Commercial) | 準備購買 | 「XX推薦」「XX評價」「XX怎麼選」 | 產品評測 + 購買建議 |
| 導航型 (Navigational) | 找特定品牌/平台 | 「XX 蝦皮」「XX 官網」 | 品牌專區 + 連結 |

**Dcard 文章最佳定位**：商業型 + 比較型（使用者已有購買意圖，但尚未決定品牌/型號）。

### 2.4 台灣市場特有模式

| 模式 | 說明 | 範例 |
|------|------|------|
| 平台後綴 | 台灣使用者習慣在關鍵字後加平台名 | 「XX推薦 ptt」「XX推薦 dcard」「XX推薦 mobile01」 |
| 年份前綴 | 搜尋最新推薦文 | 「2026 XX推薦」「2026年 XX」 |
| 價格區間 | 預算導向搜尋 | 「XX 1000元以下」「平價XX推薦」「小資XX」 |
| 比較句式 | 直接比較兩品牌 | 「象印 vs 虎牌」「A 和 B 哪個好」 |
| 繁中特定用語 | 與簡體不同的搜尋習慣 | 「筆電」非「笔记本电脑」、「隨行杯」非「随行杯」 |
| Dcard/PTT 用語 | 社群特有表達 | 「求推」「有推薦的嗎」「大家都買哪牌」 |
| 節慶搜尋 | 台灣特有節日帶動搜尋 | 「母親節禮物推薦」「中秋烤肉用具」 |

---

## 3. 工具與 API 調研

### 3.1 Google Autocomplete（免費，A-Z 展開）

**原理**：利用 Google 搜尋的自動完成建議，取得真實使用者搜尋的長尾詞。

**使用方式**：

```
非官方 endpoint（穩定運作多年）：
GET https://suggestqueries.google.com/complete/search?client=firefox&q={keyword}&hl=zh-TW

回傳格式（JSON）：
["保溫杯", ["保溫杯推薦", "保溫杯推薦 ptt", "保溫杯清洗", "保溫杯 500ml", ...]]
```

**A-Z 展開法**：對種子詞附加 a-z、0-9、常用中文字，展開更多長尾詞：
```
保溫杯 a → 保溫杯 amazon
保溫杯 p → 保溫杯 ptt
保溫杯 推 → 保溫杯 推薦
保溫杯 學 → 保溫杯 學生
```

| 項目 | 詳情 |
|------|------|
| 費用 | 完全免費 |
| API Key | 不需要 |
| Rate Limit | 無官方文件，實測約 100 req/min 安全（建議加 0.5-1s 延遲） |
| 台灣支援 | `hl=zh-TW` 回傳繁體中文建議 |
| 優點 | 反映真實搜尋行為、即時更新、無需認證 |
| 缺點 | 無搜尋量數據、非官方 endpoint 可能變動、無競爭度資訊 |
| 適用場景 | 長尾詞發現、A-Z 展開、初步關鍵字研究 |

### 3.2 Serper.dev SERP API

**說明**：提供 Google SERP 結構化資料的 API 服務，速度快（1-2 秒）。

| 項目 | 詳情 |
|------|------|
| 免費額度 | **2,500 次查詢**，無需信用卡 |
| 付費方案 | $50/50K 查詢起（$0.001/次），按量計費，6 個月有效 |
| 支援功能 | 搜尋結果、圖片、新聞、影片、購物、Scholar、**自動完成** |
| PAA 支援 | 包含在搜尋結果中（People Also Ask） |
| Related Searches | 包含在搜尋結果中 |
| 台灣支援 | `gl=tw`、`hl=zh-tw` |
| API 回應速度 | 1-2 秒 |
| 適用場景 | SERP 分析、PAA 問題挖掘、競爭度評估 |

**API 範例**：
```python
import requests
response = requests.post("https://google.serper.dev/search", json={
    "q": "保溫杯推薦 2026",
    "gl": "tw",
    "hl": "zh-tw"
}, headers={"X-API-KEY": "YOUR_KEY"})

# 回傳包含：organic results, PAA, related searches, knowledge graph
```

**免費額度分配建議**：
- 每篇文章約需 3-5 次查詢（核心詞 SERP + 長尾詞 SERP + PAA）
- 2,500 次可支撐 **500-800 篇文章**的關鍵字研究

### 3.3 pytrends（Google Trends 非官方客戶端）

| 項目 | 詳情 |
|------|------|
| 費用 | 完全免費 |
| 當前狀態 | **不穩定**：Google 頻繁更改後端，endpoint 損壞、回傳零結果等問題頻繁出現 |
| 台灣支援 | `geo='TW'` 支援台灣趨勢數據 |
| 可獲取資料 | 相對搜尋趨勢（非絕對搜尋量）、相關查詢、地區分佈 |
| Rate Limit | 嚴格，建議使用 proxy 和延遲 |
| 適用場景 | 趨勢比較（非絕對數據）、季節性分析 |

**替代方案**：

| 替代工具 | 說明 | 費用 |
|----------|------|------|
| Google Trends 網頁版 | 手動查詢，無 API 限制 | 免費 |
| Glimpse API | 企業級趨勢 API，穩定度高 | 付費 |
| SerpApi Trends | 結構化 JSON 輸出 | $50/5000 查詢起 |

**建議**：Phase 3 才考慮趨勢整合，優先使用 Google Trends 網頁版做手動驗證。

### 3.4 DataForSEO（付費備選）

| 項目 | 詳情 |
|------|------|
| SERP API | 標準 ~$0.0006/結果頁、即時 ~$0.002/頁 |
| 關鍵字建議 API | ~$0.002/個關鍵字 |
| 最低消費 | $50 起 |
| 免費額度 | 無（可申請試用） |
| 適用場景 | 大規模 SEO 分析（日查詢量 > 1000） |

**結論**：以目前專案規模，Serper.dev 免費額度已足夠，DataForSEO 作為 Phase 3 備選。

### 3.5 Google Search Console API

| 項目 | 詳情 |
|------|------|
| 費用 | 完全免費 |
| 認證 | OAuth 2.0（需 Google 開發者帳號） |
| Rate Limit | 1,200 查詢/分鐘（per site/user）|
| 可獲取資料 | 搜尋流量、關鍵字排名、點擊率、展示次數 |
| 前提 | 必須驗證網站所有權（dcard-auto.web.app 或 Dcard 文章頁面） |
| 適用場景 | 追蹤已發佈文章的實際排名表現 |

**限制**：只能追蹤**自有網站**的搜尋數據。Dcard 文章的排名數據需要 Dcard 的 GSC 權限（我們沒有）。適合 Phase 3 建立效果回饋迴路——追蹤 `dcard-auto.web.app` 的流量。

### 3.6 成本比較表

| 工具 | Phase 1 成本 | 每篇文章成本 | 精準度 | 整合難度 |
|------|-------------|-------------|--------|---------|
| Google Autocomplete | **$0** | $0 | 中（無搜尋量） | 低 |
| Serper.dev | **$0**（2500 次免費） | ~$0.003-0.005 | 高（完整 SERP） | 中 |
| pytrends | **$0** | $0 | 低（不穩定） | 高 |
| DataForSEO | ~$50 起 | ~$0.01 | 最高 | 中 |
| Google Search Console | **$0** | $0 | 高（自有數據） | 中 |
| **推薦組合** | **$0** | **~$0.003** | **中高** | **中** |

---

## 4. 關鍵字研究工作流設計

### 4.1 完整流程

```
┌─────────────────────────────────────────────────────────────────────┐
│ Step 1：種子詞提取                                                  │
│                                                                     │
│ 輸入：選定的商品列表（Product[]）                                    │
│ 處理：LLM 分析商品名稱 → 提取 1-2 個核心種子詞                      │
│ 輸出：["保溫杯", "隨行杯"]                                          │
│                                                                     │
│ 範例：                                                              │
│ 商品「象印 SM-WA48 不鏽鋼真空保溫杯 480ml」                         │
│       → 種子詞：「保溫杯」                                          │
│ 商品「虎牌 MCX-A501 夢重力超輕量隨行杯 500ml」                      │
│       → 種子詞：「保溫杯」「隨行杯」                                 │
└──────────────────────┬──────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 2：Autocomplete 展開                                           │
│                                                                     │
│ 對每個種子詞執行 A-Z 展開：                                         │
│ - 基礎展開：種子詞 + [a-z, 0-9]                                    │
│ - 中文展開：種子詞 + [推薦, 比較, 評價, 怎麼選, ptt, dcard, 便宜]  │
│ - 年份展開：{year} + 種子詞 + 推薦                                  │
│                                                                     │
│ 輸出：50-100 個候選長尾詞                                           │
│ 範例：["保溫杯推薦", "保溫杯推薦 ptt", "保溫杯 500ml",             │
│        "保溫杯推薦 2026", "學生保溫杯", ...]                         │
└──────────────────────┬──────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 3：SERP 分析（Phase 2，需 Serper API Key）                      │
│                                                                     │
│ 對前 5-10 個候選詞查詢 SERP：                                       │
│ - 首頁文章類型（論壇/部落格/電商/官網）                              │
│ - People Also Ask (PAA) 問題                                        │
│ - Related Searches 延伸詞                                           │
│                                                                     │
│ 輸出：{                                                             │
│   "serp_features": {...},                                           │
│   "paa_questions": ["保溫杯怎麼選?", "保溫杯幾ml夠?", ...],        │
│   "related_searches": ["保溫杯推薦2026", ...],                      │
│   "competition_level": "medium"                                     │
│ }                                                                   │
└──────────────────────┬──────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 4：LLM 關鍵字策略生成                                          │
│                                                                     │
│ 輸入：種子詞 + Autocomplete 結果 + SERP 分析（若有）+ 商品資訊      │
│ 處理：LLM 分析並產出結構化關鍵字策略                                 │
│ 輸出：KeywordStrategy JSON（見 4.3 節）                              │
└──────────────────────┬──────────────────────────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────────────────────────┐
│ Step 5：注入文章生成                                                 │
│                                                                     │
│ 將 KeywordStrategy 注入到 LLM 文章生成的 prompt 中：                │
│ - 主關鍵字 → 標題必用                                               │
│ - 長尾詞群 → 自然分散在文章各段                                     │
│ - FAQ 問題 → 直接作為 FAQ 區塊的問題                                │
│ - 語義相關詞 → 補充文章語義覆蓋                                     │
│                                                                     │
│ 修改：SYSTEM_INSTRUCTIONS 新增關鍵字上下文區塊                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 關鍵字難度免費評估（SERP 特徵分析法）

在沒有付費工具的情況下，透過分析 SERP 特徵來估算關鍵字競爭難度：

| SERP 特徵 | 低難度信號 | 高難度信號 |
|-----------|-----------|-----------|
| 首頁結果類型 | 論壇帖子（Dcard/PTT）、個人部落格 | 大型媒體、品牌官網、電商平台 |
| 首頁結果品質 | 內容短（<1000 字）、無結構化 | 長篇深度文、有 schema markup |
| 搜尋結果數 | <500 萬 | >5000 萬 |
| SERP 功能 | 無 Featured Snippet | 有 Featured Snippet + PAA |

**競爭度評分公式**（Phase 2 實作）：

```
competition_score = (
    forum_ratio × 30 +          # 論壇佔比越高 = 越容易
    avg_content_quality × 30 +   # 現有內容品質越差 = 越容易
    result_count_factor × 20 +   # 搜尋結果越少 = 越容易
    serp_feature_factor × 20     # SERP 功能越少 = 越容易
)
# 分數 0-100，越高越容易排名
```

### 4.3 LLM 關鍵字策略 Prompt 設計

#### 完整 Prompt

```
你是一位台灣 SEO 專家，專精繁體中文關鍵字研究。
請根據以下商品資訊和搜尋建議數據，產出一份完整的關鍵字策略。

=== 商品資訊 ===
{商品列表：名稱、品牌、品類、價格範圍}

=== Google Autocomplete 搜尋建議 ===
{autocomplete_results}

=== SERP 分析數據（若有）===
{serp_analysis}

=== 任務 ===

請分析上述數據，產出以下 JSON 格式的關鍵字策略：

{
  "primary_keyword": "保溫杯推薦",
  "primary_keyword_reason": "搜尋量最高的商業意圖詞，Autocomplete 排名第一",

  "secondary_keywords": [
    {"keyword": "2026保溫杯推薦", "intent": "commercial", "reason": "年份+推薦=高轉換"},
    {"keyword": "保溫杯推薦 ptt", "intent": "commercial", "reason": "平台後綴長尾"},
    {"keyword": "不鏽鋼保溫杯", "intent": "informational", "reason": "材質屬性修飾"}
  ],

  "long_tail_keywords": [
    "學生保溫杯推薦",
    "辦公室保溫杯 500ml",
    "保溫杯推薦 dcard",
    "保溫杯怎麼選",
    "象印 vs 虎牌 保溫杯"
  ],

  "semantic_related": [
    "保溫瓶", "隨行杯", "真空保溫", "316不鏽鋼",
    "保冰杯", "環保杯", "隨身杯"
  ],

  "title_suggestion": "【2026保溫杯推薦】冬天手腳冰冷救星！8款Dcard/PTT熱議評比：小資學生必看、象印/虎牌",
  "title_keywords_used": ["2026", "保溫杯推薦", "Dcard", "PTT", "小資", "學生", "象印", "虎牌"],

  "faq_questions": [
    {"question": "保溫杯怎麼選？容量多少才夠？", "source": "autocomplete", "target_keyword": "保溫杯怎麼選"},
    {"question": "不鏽鋼 304 和 316 差在哪？", "source": "paa", "target_keyword": "不鏽鋼 304 316 差別"},
    {"question": "保溫杯可以裝咖啡嗎？", "source": "paa", "target_keyword": "保溫杯 咖啡"},
    {"question": "保溫杯多久要換一次？", "source": "autocomplete", "target_keyword": "保溫杯 壽命"},
    {"question": "保溫杯推薦什麼品牌？學生平價款？", "source": "llm", "target_keyword": "保溫杯推薦 品牌 學生"}
  ],

  "keyword_placement_plan": {
    "title": "保溫杯推薦 + 年份 + 品牌名",
    "first_100_chars": "保溫杯推薦 + 2026",
    "intro_paragraph": "保溫杯 + 保溫瓶 + 隨行杯（語義覆蓋）",
    "product_sections": "各品牌名 + 型號（長尾入口）",
    "faq_section": "長尾問題詞",
    "conclusion": "主關鍵字重複 + CTA"
  },

  "estimated_difficulty": "medium",
  "difficulty_reason": "搜尋結果有論壇帖子，但也有專業評測網站"
}

=== 規則 ===
1. primary_keyword 必須是商業意圖（使用者想買東西）
2. 所有關鍵字必須是繁體中文（台灣用語）
3. FAQ 問題必須是使用者真的會搜尋的問題
4. 語義相關詞不要重複主關鍵字，要是不同說法
5. 標題建議必須在 20-35 字內
6. 若有 SERP 數據，優先採用 PAA 問題作為 FAQ
```

#### JSON 輸出格式（KeywordStrategy）

```typescript
interface KeywordStrategy {
  primary_keyword: string;           // 主關鍵字
  primary_keyword_reason: string;    // 選擇原因
  secondary_keywords: Array<{        // 次要關鍵字 (3-5 個)
    keyword: string;
    intent: "informational" | "comparative" | "commercial" | "navigational";
    reason: string;
  }>;
  long_tail_keywords: string[];      // 長尾詞群 (5-10 個)
  semantic_related: string[];        // 語義相關詞 (5-10 個)
  title_suggestion: string;          // 標題建議
  title_keywords_used: string[];     // 標題中使用的關鍵字
  faq_questions: Array<{             // FAQ 問題 (5-8 個)
    question: string;
    source: "autocomplete" | "paa" | "related" | "llm";
    target_keyword: string;
  }>;
  keyword_placement_plan: {          // 關鍵字佈局計畫
    title: string;
    first_100_chars: string;
    intro_paragraph: string;
    product_sections: string;
    faq_section: string;
    conclusion: string;
  };
  estimated_difficulty: "easy" | "medium" | "hard";
  difficulty_reason: string;
}
```

### 4.4 關鍵字注入文章生成的整合方式

在現有文章生成流程中插入關鍵字上下文：

**修改點**：`llm_service.py` 的 `generate_article()` 函數

```
現有流程：
  full_system_prompt = SYSTEM_INSTRUCTIONS + user_template
  user_message = 年份提醒 + 商品資訊 + 文章類型

新增流程：
  full_system_prompt = SYSTEM_INSTRUCTIONS + user_template
  keyword_context = format_keyword_strategy(keyword_strategy)  # 新增
  user_message = 年份提醒 + keyword_context + 商品資訊 + 文章類型
```

**關鍵字上下文格式**（注入 user_message）：

```
=== SEO 關鍵字策略（基於搜尋數據分析）===

主關鍵字：保溫杯推薦（必須出現在標題和首段 100 字內）
次要關鍵字：2026保溫杯推薦、保溫杯推薦 ptt、不鏽鋼保溫杯
長尾詞群（自然分散在文章中）：學生保溫杯推薦、辦公室保溫杯 500ml、保溫杯怎麼選
語義相關詞（豐富語義覆蓋）：保溫瓶、隨行杯、真空保溫、316不鏽鋼

建議標題：【2026保溫杯推薦】冬天手腳冰冷救星！8款Dcard/PTT熱議評比：小資學生必看

FAQ 問題（必須使用以下問題，這些是真實使用者搜尋的問題）：
Q1: 保溫杯怎麼選？容量多少才夠？
Q2: 不鏽鋼 304 和 316 差在哪？
Q3: 保溫杯可以裝咖啡嗎？
Q4: 保溫杯多久要換一次？
Q5: 保溫杯推薦什麼品牌？學生平價款？

=== 以下是商品資訊 ===
```

---

## 5. 系統整合設計

### 5.1 後端：新增 keyword_research_service.py

```
backend/app/services/keyword_research_service.py

class KeywordResearchService:
    """長尾關鍵字研究服務"""

    # ---- Phase 1 核心功能 ----

    async def research_keywords(
        self, products: list[Product], user_id: int
    ) -> KeywordStrategy:
        """完整關鍵字研究流程"""
        # 1. 提取種子詞
        seeds = await self._extract_seed_keywords(products)
        # 2. Autocomplete 展開
        autocomplete = await self._expand_autocomplete(seeds)
        # 3. LLM 策略生成
        strategy = await self._generate_strategy(
            products, seeds, autocomplete
        )
        return strategy

    async def _extract_seed_keywords(
        self, products: list[Product]
    ) -> list[str]:
        """從商品名稱提取種子詞（LLM 輔助）"""
        ...

    async def _expand_autocomplete(
        self, seeds: list[str]
    ) -> dict[str, list[str]]:
        """Google Autocomplete A-Z 展開"""
        ...

    async def _generate_strategy(
        self, products, seeds, autocomplete, serp_data=None
    ) -> KeywordStrategy:
        """LLM 生成關鍵字策略（JSON 輸出）"""
        ...

    def format_keyword_context(
        self, strategy: KeywordStrategy
    ) -> str:
        """格式化關鍵字上下文，注入文章生成 prompt"""
        ...

    # ---- Phase 2 進階功能 ----

    async def analyze_serp(
        self, keyword: str
    ) -> dict:
        """Serper.dev SERP 分析（PAA + Related + 競爭度）"""
        ...

    async def estimate_difficulty(
        self, serp_data: dict
    ) -> str:
        """基於 SERP 特徵的難度評估"""
        ...
```

**API 路由新增**：

```
backend/app/api/keywords.py

POST /api/keywords/research
  Body: { product_ids: [1,2,3] }
  Response: KeywordStrategy JSON
  說明：執行完整關鍵字研究

GET /api/keywords/{research_id}
  Response: 儲存的研究結果
  說明：讀取歷史研究結果

POST /api/keywords/autocomplete
  Body: { seed: "保溫杯" }
  Response: { suggestions: [...] }
  說明：單獨執行 Autocomplete 展開（前端預覽用）
```

### 5.2 後端：文章生成流程修改

**修改檔案**：`backend/app/api/articles.py`、`backend/app/services/llm_service.py`

**修改 1**：`POST /api/articles/generate` 新增可選參數

```python
class GenerateRequest(BaseModel):
    product_ids: list[int]
    article_type: str = "comparison"
    target_forum: str = "goodthings"
    model: str | None = None
    prompt_template_id: int | None = None
    include_images: bool = False
    sub_id: str | None = None
    # 新增
    keyword_strategy: dict | None = None        # 前端傳入的關鍵字策略
    keyword_research_id: int | None = None      # 或引用已儲存的研究結果
```

**修改 2**：`llm_service.generate_article()` 注入關鍵字上下文

```python
# 在組合 user_message 時，若有 keyword_strategy，插入關鍵字上下文
if keyword_strategy:
    keyword_context = keyword_service.format_keyword_context(keyword_strategy)
    user_message = f"{year_reminder}\n\n{keyword_context}\n\n{product_info}"
else:
    user_message = f"{year_reminder}\n\n{product_info}"
```

**修改 3**：SEO 評分增加關鍵字匹配度

```python
# seo_service.analyze() 可選傳入 keyword_strategy
# 若有策略，額外檢查：
# - 主關鍵字是否出現在標題
# - 長尾詞覆蓋率
# - FAQ 問題匹配度
```

### 5.3 前端：關鍵字研究面板 UI

**位置**：文章生成對話框中，在「選擇商品」和「生成」按鈕之間，新增「關鍵字研究」步驟。

```
┌─────────────────────────────────────────────────┐
│ 生成文章                                         │
│                                                  │
│ Step 1: 選擇商品 ✅                              │
│ ┌──────────────────────────────────────────────┐ │
│ │ [拖拽排序的商品列表]                          │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Step 2: 關鍵字研究 (選填)                        │
│ ┌──────────────────────────────────────────────┐ │
│ │ [🔍 一鍵研究關鍵字]  [⏭️ 跳過，讓 AI 自行判斷] │ │
│ │                                              │ │
│ │ ── 研究結果（點擊展開）──                    │ │
│ │ 🎯 主關鍵字：保溫杯推薦                     │ │
│ │ 📋 次要詞：2026保溫杯推薦、ptt、不鏽鋼       │ │
│ │ 🔗 長尾詞：學生保溫杯、500ml 辦公室...       │ │
│ │ 💡 建議標題：【2026保溫杯推薦】...           │ │
│ │ ❓ FAQ (5 題)：保溫杯怎麼選？...              │ │
│ │                                              │ │
│ │ [✏️ 編輯關鍵字]  [🔄 重新研究]               │ │
│ └──────────────────────────────────────────────┘ │
│                                                  │
│ Step 3: 生成設定                                 │
│ 文章類型 / 目標看板 / LLM 模型 / ...            │
│                                                  │
│ [📝 生成文章]                                    │
└─────────────────────────────────────────────────┘
```

**UI 元件規劃**：

| 元件 | 說明 |
|------|------|
| `KeywordResearchPanel.jsx` | 關鍵字研究主面板 |
| `KeywordStrategyView.jsx` | 研究結果展示（可折疊） |
| `KeywordEditor.jsx` | 編輯關鍵字策略（手動調整） |

**互動流程**：

1. 使用者選好商品後，可選「一鍵研究關鍵字」或「跳過」
2. 點擊研究 → 呼叫 `POST /api/keywords/research` → Loading 狀態
3. 研究完成 → 展示結果（主關鍵字、長尾詞、建議標題、FAQ）
4. 使用者可手動編輯任何欄位
5. 確認後 → 帶入 `keyword_strategy` 參數生成文章

### 5.4 資料模型：KeywordResearch 表

```python
# backend/app/models/keyword_research.py

class KeywordResearch(Base):
    __tablename__ = "keyword_research"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # 輸入
    product_ids = Column(JSON, nullable=False)      # [1, 2, 3]
    seed_keywords = Column(JSON, nullable=False)     # ["保溫杯", "隨行杯"]

    # Autocomplete 原始數據
    autocomplete_results = Column(JSON)              # {"保溫杯": ["保溫杯推薦", ...]}

    # SERP 數據 (Phase 2)
    serp_data = Column(JSON)                         # Serper.dev 回傳數據

    # LLM 生成的策略
    strategy = Column(JSON, nullable=False)          # KeywordStrategy JSON

    # 使用紀錄
    used_in_articles = Column(JSON, default=[])      # [article_id, ...]

    # 時間戳
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, onupdate=func.now())
```

**設計考量**：
- 研究結果可複用（同類商品不必重新研究）
- 記錄哪些文章使用了此策略（追蹤效果用）
- JSON 欄位彈性儲存（策略格式可能隨版本演進）
- Per-user 隔離（與現有 Product/Article 一致）

---

## 6. 實作路線圖

### Phase 1：基礎關鍵字研究（核心功能）

**目標**：Autocomplete 展開 + LLM 策略生成 + 注入文章生成

| 項目 | 說明 | 新增/修改檔案 |
|------|------|-------------|
| Autocomplete 服務 | Google Autocomplete A-Z 展開 + 中文修飾詞展開 | `services/keyword_research_service.py`（新增） |
| LLM 策略生成 | Prompt 設計 + JSON 結構化輸出 + 強制使用 gemini-2.5-flash（節省成本） | 同上 |
| API 端點 | `/api/keywords/research` + `/api/keywords/autocomplete` | `api/keywords.py`（新增） |
| 資料模型 | KeywordResearch 表 + Alembic 遷移 | `models/keyword_research.py`（新增） |
| 文章生成整合 | 注入關鍵字上下文到 LLM prompt | `api/articles.py`、`services/llm_service.py`（修改） |
| 前端面板 | KeywordResearchPanel + 結果展示 + 編輯功能 | `components/KeywordResearchPanel.jsx`（新增） |
| SEO 評分增強 | 關鍵字匹配度加入評分 | `services/seo_service.py`（修改） |

**預計新增**：
- 後端：3 個新檔案 + 2 個修改
- 前端：2-3 個新元件
- 資料庫：1 個新表

### Phase 2：SERP 分析與競爭度評估

**目標**：Serper.dev 整合 + PAA 問題挖掘 + 關鍵字難度評估

**前提**：申請 Serper.dev API Key（免費 2,500 次）

| 項目 | 說明 |
|------|------|
| Serper 整合 | SERP 查詢 + PAA 提取 + Related Searches |
| 競爭度評估 | SERP 特徵分析 → 難度分數 |
| FAQ 增強 | PAA 問題直接作為 FAQ 來源 |
| 前端展示 | 難度指標 + SERP 預覽 |

### Phase 3：追蹤與回饋迴路

**目標**：效果追蹤 + 趨勢分析 + 策略迭代

| 項目 | 說明 |
|------|------|
| GSC 整合 | 追蹤已發佈文章的搜尋排名 |
| 趨勢分析 | Google Trends 手動/API 整合 |
| 效果回饋 | 排名數據 → 關鍵字策略調整建議 |
| A/B 測試 | 比較有/無關鍵字研究的文章排名差異 |

---

## 7. 實作優先級表

| 優先級 | 功能 | Phase | 依賴 | 預計影響 |
|--------|------|-------|------|---------|
| P0 | Autocomplete 展開服務 | 1 | 無 | 基礎設施 |
| P0 | LLM 關鍵字策略 Prompt | 1 | Autocomplete | 核心邏輯 |
| P0 | 關鍵字注入文章生成 | 1 | 策略 Prompt | 直接提升 SEO |
| P1 | 前端關鍵字研究面板 | 1 | API 端點 | 使用者體驗 |
| P1 | KeywordResearch 資料模型 | 1 | 無 | 數據持久化 |
| P1 | SEO 評分增強（關鍵字匹配） | 1 | 策略 JSON | 評分精準度 |
| P2 | Serper SERP 分析 | 2 | API Key | 競爭度資訊 |
| P2 | PAA 問題整合 | 2 | Serper | FAQ 精準度 |
| P2 | 關鍵字難度評估 | 2 | SERP 數據 | 選詞決策 |
| P3 | GSC 排名追蹤 | 3 | 網站驗證 | 效果驗證 |
| P3 | 趨勢分析整合 | 3 | pytrends/API | 季節性策略 |
| P3 | 效果回饋迴路 | 3 | GSC 數據 | 持續優化 |

---

## 8. 成本預估

### 8.1 每篇文章的邊際成本

以下假設每篇文章選 3-5 個商品，提取 2 個種子詞。

#### Phase 1（Autocomplete + LLM 策略）

| 項目 | 呼叫次數 | 單價 | 小計 (USD) | 說明 |
|------|---------|------|-----------|------|
| Google Autocomplete | ~94 次 | $0 | **$0** | 每個種子詞 ≈47 次（基礎+26字母+10數字+10中文修飾詞） |
| LLM 策略生成 (gemini-2.5-flash) | 1 次 | — | **~$0.0008** | Input ~2000 tokens × $0.15/M + Output ~800 tokens × $0.60/M |
| **Phase 1 每篇合計** | | | **~$0.001** | **≈ NT$0.03** |

#### Phase 2（+ Serper SERP 分析）

| 項目 | 呼叫次數 | 單價 | 小計 (USD) | 說明 |
|------|---------|------|-----------|------|
| Phase 1 全部 | — | — | $0.001 | 同上 |
| Serper.dev SERP 查詢 | 3-5 次 | $0.001/次 | **~$0.004** | 核心詞+長尾詞 SERP（前 2500 次免費） |
| **Phase 2 每篇合計** | | | **~$0.005** | **≈ NT$0.16** |

#### Phase 3（+ 排名追蹤）

| 項目 | 呼叫次數 | 單價 | 小計 (USD) | 說明 |
|------|---------|------|-----------|------|
| Phase 2 全部 | — | — | $0.005 | 同上 |
| Google Search Console | 不限 | $0 | **$0** | 完全免費 |
| Google Trends（手動/網頁版） | — | $0 | **$0** | 完全免費 |
| **Phase 3 每篇合計** | | | **~$0.005** | **≈ NT$0.16** |

### 8.2 月度成本預估

以不同文章產量估算月度總成本（含關鍵字研究的增量成本，不含原本的文章生成 LLM 費用）：

| 月產量 | Phase 1 月成本 | Phase 2 月成本 | Phase 3 月成本 |
|--------|---------------|---------------|---------------|
| 30 篇/月 | ~$0.03（NT$1） | ~$0.15（NT$5） | ~$0.15（NT$5） |
| 100 篇/月 | ~$0.10（NT$3） | ~$0.50（NT$16） | ~$0.50（NT$16） |
| 300 篇/月 | ~$0.30（NT$10） | ~$1.50（NT$49） | ~$1.50（NT$49） |

> 匯率：USD 1 = TWD 32.5（系統內建匯率）

### 8.3 API 免費額度耗盡時程

| API | 免費額度 | 每篇消耗 | 可支撐篇數 | 以 100 篇/月計 |
|-----|---------|---------|-----------|---------------|
| Google Autocomplete | 無限制 | ~94 次 | ∞ | ∞ |
| Serper.dev | 2,500 次 | 3-5 次 | **500-800 篇** | **~5-8 個月** |
| Google Search Console | 無限制 | 不限 | ∞ | ∞ |

**Serper 免費額度用完後**：$50 購買 50,000 次（可支撐 ~10,000 篇），約 NT$1,625。

### 8.4 與現有文章生成成本的對比

現有文章生成（不含關鍵字研究）的 LLM 費用參考：

| 模型 | 每篇文章 LLM 成本（估算） | 說明 |
|------|--------------------------|------|
| gemini-2.5-flash | ~$0.003-0.005 | Input ~3K tokens × $0.15/M + Output ~4K tokens × $0.60/M |
| gemini-2.5-pro | ~$0.05-0.08 | 同等 token 量，單價高 8-17 倍 |
| claude-sonnet-4-5 | ~$0.07-0.12 | 同等 token 量，單價最高 |
| claude-haiku-4-5 | ~$0.025-0.04 | 中等定價 |

**關鍵字研究增量佔比**：

| 場景 | 原文章成本 | + 關鍵字研究 | 增量比例 |
|------|-----------|-------------|---------|
| Flash 生成 + Phase 1 研究 | $0.004 | $0.005 | **+25%** |
| Flash 生成 + Phase 2 研究 | $0.004 | $0.009 | **+125%** |
| Pro 生成 + Phase 1 研究 | $0.065 | $0.066 | **+1.5%** |
| Sonnet 生成 + Phase 2 研究 | $0.095 | $0.100 | **+5%** |

> 使用越貴的模型生成文章，關鍵字研究的邊際成本佔比越低。

### 8.5 成本優化策略

| 策略 | 預期節省 | 實作難度 |
|------|---------|---------|
| 研究結果快取（同品類商品共用） | 40-60% | 低 |
| Autocomplete 結果 24h 快取 | 減少重複請求 | 低 |
| LLM 策略用 gemini-2.5-flash（非 pro） | 已採用，為最低成本方案 | — |
| Serper 查詢僅在 Phase 2 啟用 | Phase 1 完全免費 | — |
| 批量研究（多篇文章共用一次研究） | 50-70% | 中 |

### 8.6 成本摘要

| | Phase 1 | Phase 2 | Phase 3 |
|---|---------|---------|---------|
| 初始投入 | **$0** | **$0**（免費額度） | **$0** |
| 每篇邊際成本 | **~NT$0.03** | **~NT$0.16** | **~NT$0.16** |
| 100 篇/月成本 | **~NT$3** | **~NT$16** | **~NT$16** |
| 免費額度耗盡後 | 無變化 | +NT$1,625/50K 次 | 無變化 |

**結論**：三個 Phase 的初始投入均為 $0。Phase 1 完全免費（Autocomplete + gemini-2.5-flash），Phase 2 在免費額度內也幾乎免費。即使 Serper 免費額度用完，按 100 篇/月的產量，每月增量成本不到 NT$20。

---

## 附錄

### A. 參考資源

| 資源 | 用途 |
|------|------|
| [Serper.dev 文件](https://serper.dev/docs) | SERP API 文件 |
| [Google Autocomplete endpoint](https://suggestqueries.google.com/complete/search?client=firefox&q=test&hl=zh-TW) | 非官方自動完成 API |
| [DataForSEO 文件](https://docs.dataforseo.com/) | 付費 SEO API 文件 |
| [Google Search Console API](https://developers.google.com/webmaster-tools/v1/how-tos/authorizing) | GSC 認證與使用 |

### B. 與現有系統的衝突風險

| 風險 | 說明 | 緩解策略 |
|------|------|---------|
| 文章生成時間增加 | 多了關鍵字研究步驟 | 設為可選步驟 + Autocomplete 並行請求 |
| LLM 成本增加 | 多一次 LLM 呼叫（策略生成） | 使用 gemini-2.5-flash + 快取研究結果 |
| Autocomplete rate limit | 大量並行請求可能被封 | 請求間隔 0.5-1s + 結果快取 |
| SYSTEM_INSTRUCTIONS 過長 | 注入關鍵字上下文增加 token | 控制上下文在 500 token 以內 |

### C. 成功指標

| 指標 | 目標 | 測量方式 |
|------|------|---------|
| 關鍵字覆蓋率 | 主關鍵字出現在標題+首段 100% | SEO 評分自動檢查 |
| 長尾詞使用率 | 至少 3 個長尾詞自然出現 | 文章內容分析 |
| FAQ 精準度 | FAQ 問題 100% 來自搜尋數據 | 比對 Autocomplete/PAA |
| SEO 評分提升 | 平均分數從 B 提升到 A | 前後對比 |
| Google 排名 | Phase 3 追蹤，目標 Top 20 | GSC 數據 |
