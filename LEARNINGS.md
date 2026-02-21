# LEARNINGS.md

## 2026-02-21 [錯誤修正] 在錯誤專案實作功能

**觸發**：用戶要求實作聯盟行銷匯入功能，AI 在 shoppe_video 實作，但線上產品是 Dcard_auto
**根因**：未確認用戶的線上產品是哪個專案，假設了錯誤的目標
**修改**：新增 auto memory 記錄專案地圖，明確標註 Dcard_auto 為線上產品
**狀態**：已提煉到 auto memory MEMORY.md
