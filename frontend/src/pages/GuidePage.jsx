export default function GuidePage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">使用說明</h1>
      <p className="text-gray-500 text-sm">測試人員操作指南 — 從蝦皮擷取到 Dcard 發文的完整流程</p>

      {/* 系統簡介 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">系統簡介</h2>
        <p className="text-gray-600 text-sm mb-4">
          Dcard Auto 是一套自動文章生成系統，從蝦皮擷取商品資料，透過 AI 生成比較文或開箱文，經 SEO 優化後發佈到 Dcard。
        </p>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg font-medium">蝦皮擷取</span>
          <span className="text-gray-400">→</span>
          <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">AI 文章生成</span>
          <span className="text-gray-400">→</span>
          <span className="bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-medium">SEO 優化</span>
          <span className="text-gray-400">→</span>
          <span className="bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg font-medium">Dcard 發文</span>
        </div>
      </section>

      {/* 前置準備 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">前置準備</h2>
        <h3 className="text-sm font-medium text-gray-700 mb-2">安裝 Chrome Extension</h3>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>開啟 Chrome，前往 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">chrome://extensions/</code></li>
          <li>右上角開啟<strong>「開發者模式」</strong></li>
          <li>點擊<strong>「載入未封裝項目」</strong>，選擇專案中的 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">chrome-extension/</code> 資料夾</li>
          <li>載入成功後，工具列會出現 Extension 圖示</li>
        </ol>
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-700">
            <strong>重要：</strong>點擊 Extension 圖示開啟 Popup，確認 API 模式為<strong>「☁️ 雲端」</strong>。
            若顯示為本地模式，請點擊切換到雲端模式，以連接線上伺服器。
          </p>
        </div>
      </section>

      {/* Step 1 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">1</span>
          <h2 className="text-lg font-semibold text-gray-800">擷取蝦皮商品</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>前往 <a href="https://shopee.tw" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">shopee.tw</a> 並打開任意商品頁面</li>
          <li>等待頁面完整載入（商品名稱、價格、圖片都顯示後）</li>
          <li>點擊 Extension 圖示，在 Popup 中點擊<strong>「擷取此商品」</strong>按鈕</li>
          <li>看到成功提示後，商品資料已自動送到後端</li>
          <li>重複以上步驟擷取更多商品（生成比較文需至少 2 個商品）</li>
        </ol>
      </section>

      {/* Step 2 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">2</span>
          <h2 className="text-lg font-semibold text-gray-800">商品管理</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>在左側導航點擊<strong>「商品管理」</strong>頁面</li>
          <li>確認剛才擷取的商品已出現在列表中</li>
          <li>可查看商品名稱、價格、圖片等資訊</li>
          <li>若有不需要的商品，可勾選後批量刪除</li>
        </ol>
      </section>

      {/* Step 3 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">3</span>
          <h2 className="text-lg font-semibold text-gray-800">生成文章</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>在商品管理頁面，<strong>勾選 2 個以上商品</strong></li>
          <li>點擊上方的<strong>「生成文章」</strong>按鈕</li>
          <li>選擇目標看板（如：好物研究室、美妝）與文章類型</li>
          <li>點擊確認，等待 AI 生成文章（約 10~30 秒）</li>
          <li>生成完成後會自動跳轉到文章管理頁面</li>
        </ol>
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-700">
            <strong>提示：</strong>若雲端伺服器剛啟動（冷啟動），第一次請求可能需要等待 30~60 秒，這是正常現象。
          </p>
        </div>
      </section>

      {/* Step 4 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">4</span>
          <h2 className="text-lg font-semibold text-gray-800">SEO 優化</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>前往<strong>「文章管理」</strong>頁面，找到剛生成的文章</li>
          <li>點擊文章卡片上的<strong>「SEO 分析」</strong>按鈕</li>
          <li>系統會顯示 SEO 評分（滿分 100）及 8 項細項分析</li>
          <li>若分數不理想，點擊<strong>「一鍵優化」</strong>，AI 會自動改寫提升 SEO</li>
          <li>優化後可再次分析確認分數提升</li>
        </ol>
      </section>

      {/* Step 5 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">5</span>
          <h2 className="text-lg font-semibold text-gray-800">複製到 Dcard</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>在文章管理頁面，點擊<strong>「複製」</strong>按鈕</li>
          <li>系統會將格式化後的文章內容複製到剪貼簿</li>
          <li>前往 <a href="https://www.dcard.tw/forum" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Dcard</a> 對應看板，點擊發文</li>
          <li>在編輯器中直接 <kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-xs">Ctrl+V</kbd> 貼上</li>
          <li>檢查內容、調整標題後發佈</li>
        </ol>
      </section>

      {/* 注意事項 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">注意事項</h2>
        <ul className="text-sm text-gray-600 space-y-3">
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>冷啟動延遲：</strong>雲端伺服器在閒置一段時間後會休眠，首次請求可能需要 30~60 秒等待啟動，後續請求會恢復正常速度。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>圖片來源：</strong>文章中的圖片連結指向蝦皮 CDN，若商品下架圖片可能失效。建議在文章管理頁使用「下載圖片」功能備份。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>Extension 模式：</strong>Popup 中可切換「雲端/本地」模式。測試時請使用雲端模式；若本地有啟動後端服務，可切換到本地模式（port 8001）。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>商品擷取時機：</strong>需等蝦皮商品頁完整載入後再擷取，過早點擊可能導致資料不完整。</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
