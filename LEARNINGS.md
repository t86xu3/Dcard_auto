# LEARNINGS.md

## 2026-02-21 [錯誤修正] 在錯誤專案實作功能

**觸發**：用戶要求實作聯盟行銷匯入功能，AI 在 shoppe_video 實作，但線上產品是 Dcard_auto
**根因**：未確認用戶的線上產品是哪個專案，假設了錯誤的目標
**修改**：新增 auto memory 記錄專案地圖，明確標註 Dcard_auto 為線上產品
**狀態**：已提煉到 auto memory MEMORY.md

## 2026-02-23 [錯誤修正] 新增待辦只更新 CLAUDE.md 遺漏 PROJECT_MAP.md

**觸發**：用戶要求新增 3 項待辦，AI 只加到 CLAUDE.md 開發藍圖，忘了 PROJECT_MAP.md 也有 Phase 待辦清單
**根因**：文檔同步對應關係缺少「待辦項目」的雙邊同步規則
**修改**：全域 CLAUDE.md §3.5 對應關係新增「新增/修改待辦項目 → PROJECT_MAP + CLAUDE.md 雙邊同步」
**狀態**：已提煉到全域 CLAUDE.md §3.5
