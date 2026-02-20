export default function GuidePage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">使用說明</h1>
      <p className="text-gray-500 text-sm">完整操作指南 — 從蝦皮擷取到 Dcard 發文的全流程</p>

      {/* 系統簡介 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">系統簡介</h2>
        <p className="text-gray-600 text-sm mb-4">
          Dcard Auto 是一套自動文章生成系統，從蝦皮擷取商品資料，透過 AI（Gemini / Claude）生成比較文或開箱文，經 SEO 優化後發佈到 Dcard。
        </p>
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="bg-orange-50 text-orange-600 px-3 py-1.5 rounded-lg font-medium">1. 蝦皮擷取</span>
          <span className="text-gray-400">→</span>
          <span className="bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg font-medium">2. 選擇範本與模型</span>
          <span className="text-gray-400">→</span>
          <span className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-medium">3. AI 文章生成</span>
          <span className="text-gray-400">→</span>
          <span className="bg-green-50 text-green-600 px-3 py-1.5 rounded-lg font-medium">4. SEO 優化</span>
          <span className="text-gray-400">→</span>
          <span className="bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg font-medium">5. 複製到 Dcard</span>
        </div>
      </section>

      {/* 前置準備 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">前置準備</h2>

        <h3 className="text-sm font-medium text-gray-700 mb-2">1. 註冊帳號</h3>
        <p className="text-sm text-gray-600 mb-4">
          前往登入頁面，切換到「註冊」分頁，填寫帳號、Email、密碼。註冊後需等待管理員核准才能使用文章生成功能。
        </p>

        <h3 className="text-sm font-medium text-gray-700 mb-2">2. 安裝 Chrome Extension</h3>
        <a
          href="https://github.com/t86xu3/Dcard_auto/archive/refs/heads/main.zip"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700 transition-all active:scale-95 cursor-pointer mb-4"
        >
          <span>⬇️</span> 下載專案 ZIP
        </a>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1 mb-4">
          <li>點擊上方按鈕下載 ZIP，解壓縮後找到 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">chrome-extension/</code> 資料夾</li>
          <li>開啟 Chrome，前往 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">chrome://extensions/</code></li>
          <li>右上角開啟<strong>「開發者模式」</strong></li>
          <li>點擊<strong>「載入未封裝項目」</strong>，選擇 <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">chrome-extension/</code> 資料夾</li>
          <li>載入成功後，工具列會出現 Extension 圖示</li>
        </ol>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-sm text-amber-700">
            <strong>重要：</strong>點擊 Extension 圖示開啟 Popup，確認 API 模式為<strong>「☁️ 雲端」</strong>。
            若顯示為本地模式，請點擊切換到雲端模式。
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
          <li>點擊 Extension 圖示，在 Popup 中點擊<strong>「擷取此商品」</strong></li>
          <li>看到成功提示後，商品資料已自動送到後端</li>
          <li>重複以上步驟擷取更多商品（生成比較文需至少 2 個商品）</li>
        </ol>
      </section>

      {/* Step 2 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">2</span>
          <h2 className="text-lg font-semibold text-gray-800">商品管理與編輯</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>在左側導航點擊<strong>「🛒 商品管理」</strong></li>
          <li>確認擷取的商品已出現在列表中（含名稱、價格、評分、銷量）</li>
          <li>若商品連結有誤或缺少，點擊 <strong>✏️</strong> 或 <strong>🔗 新增連結</strong> 可手動編輯網址</li>
          <li>點擊 <strong>📥 圖片</strong> 可將商品圖片下載備份到伺服器</li>
          <li>不需要的商品可勾選後點擊 <strong>🗑️ 刪除</strong> 批量移除</li>
        </ol>
      </section>

      {/* Step 3 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">3</span>
          <h2 className="text-lg font-semibold text-gray-800">生成文章</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li><strong>勾選商品</strong>（1 個 → 開箱文，2 個以上 → 比較文）</li>
          <li>選擇 <strong>Prompt 範本</strong>（下拉選單，預設標記為「預設」）
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-500">
              <li>Dcard 好物推薦文 — 基本 7 段式結構</li>
              <li>Google 排名衝刺版 — 針對 Google 首頁排名優化</li>
              <li>也可在「設定」頁自訂範本</li>
            </ul>
          </li>
          <li>可選：勾選 <strong>🖼️ 附圖給 LLM</strong>，讓 AI 看圖分析商品規格
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-500">
              <li>📸 主圖（商品照片）— 最多 3 張</li>
              <li>📋 描述圖（規格/成分）— 最多 5 張</li>
              <li>附圖會增加 token 費用，但文章品質更好</li>
            </ul>
          </li>
          <li>點擊 <strong>✨ 生成比較文/開箱文</strong>，等待 AI 生成（約 30~60 秒）</li>
          <li>生成完成後會提示前往文章管理頁面查看</li>
        </ol>
        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-sm text-blue-700">
            <strong>提示：</strong>使用的 AI 模型可在「⚙️ 設定」頁面切換（Gemini Flash / Pro / Claude Sonnet / Haiku）。不同模型品質和費用不同。
          </p>
        </div>
      </section>

      {/* Step 4 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">4</span>
          <h2 className="text-lg font-semibold text-gray-800">文章管理與編輯</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>前往<strong>「📝 文章管理」</strong>，左側列表顯示所有文章</li>
          <li>點擊文章查看內容，可直接修改：
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-500">
              <li>點擊標題可直接編輯</li>
              <li>點擊 <strong>✏️ 編輯內文</strong> 可修改文章內容</li>
            </ul>
          </li>
          <li>文章中的商品圖片可點擊 <strong>📋 複製圖片</strong> 單張複製</li>
        </ol>
      </section>

      {/* Step 5 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">5</span>
          <h2 className="text-lg font-semibold text-gray-800">SEO 分析與優化</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>在文章管理頁面，點擊 <strong>📊 SEO 分析</strong> 查看評分</li>
          <li>系統會分析 8 項 SEO 指標（滿分 100），包含：
            <ul className="list-disc list-inside ml-4 mt-1 text-gray-500">
              <li>標題 SEO、關鍵字密度、關鍵字分佈</li>
              <li>內容結構、文章長度、FAQ 結構</li>
              <li>圖片使用、可讀性</li>
            </ul>
          </li>
          <li>若分數不理想，點擊 <strong>🚀 SEO 優化</strong>，AI 會自動改寫</li>
          <li>優化完成後可查看前後分數對比</li>
        </ol>
        <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
          <p className="text-sm text-green-700">
            <strong>省錢提示：</strong>SEO 優化固定使用 Gemini Flash（最便宜的模型），不管你在設定頁選了什麼模型，SEO 優化都不會花很多錢。
          </p>
        </div>
      </section>

      {/* Step 6 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className="bg-blue-600 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">6</span>
          <h2 className="text-lg font-semibold text-gray-800">複製到 Dcard 發文</h2>
        </div>
        <ol className="list-decimal list-inside text-sm text-gray-600 space-y-2 ml-1">
          <li>在文章管理頁面，點擊 <strong>📋 複製</strong> 按鈕</li>
          <li>文章文字已自動複製到剪貼簿（Dcard 純文字格式，無 Markdown）</li>
          <li>前往 <a href="https://www.dcard.tw/forum" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">Dcard</a> 對應看板，點擊發文</li>
          <li>在編輯器中 <kbd className="bg-gray-100 border border-gray-300 px-1.5 py-0.5 rounded text-xs">Ctrl+V</kbd> 貼上文字</li>
          <li>手動插入圖片（從文章頁面逐張「📋 複製圖片」後貼到 Dcard 編輯器）</li>
          <li>檢查內容、調整標題後發佈</li>
        </ol>
      </section>

      {/* 設定說明 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">⚙️ 設定頁面功能</h2>
        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <h3 className="font-medium text-gray-700 mb-1">AI 模型選擇</h3>
            <p>可選擇不同的 AI 模型來生成文章，各模型特點不同：</p>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-xs border border-gray-200 rounded-lg">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-2 text-left">模型</th>
                    <th className="p-2 text-left">特點</th>
                    <th className="p-2 text-right">參考價格/篇</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-gray-100">
                    <td className="p-2 font-medium">Gemini 2.5 Flash</td>
                    <td className="p-2">最便宜、速度快</td>
                    <td className="p-2 text-right">~NT$0.13</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="p-2 font-medium">Gemini 2.5 Pro</td>
                    <td className="p-2">品質較好</td>
                    <td className="p-2 text-right">~NT$2.8</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="p-2 font-medium">Claude Haiku 4.5</td>
                    <td className="p-2">性價比高</td>
                    <td className="p-2 text-right">~NT$1.5</td>
                  </tr>
                  <tr className="border-t border-gray-100">
                    <td className="p-2 font-medium">Claude Sonnet 4.5</td>
                    <td className="p-2">寫作品質最好</td>
                    <td className="p-2 text-right">~NT$4</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h3 className="font-medium text-gray-700 mb-1">Prompt 範本管理</h3>
            <p>系統內建兩套範本，也可以自訂：</p>
            <ul className="list-disc list-inside ml-2 mt-1 space-y-1">
              <li><strong>Dcard 好物推薦文</strong> — 基礎 7 段式結構，適合一般推薦</li>
              <li><strong>Google 排名衝刺版</strong> — 針對 Google 搜尋排名優化，結構經過實測驗證</li>
              <li>點擊 <strong>📄 新增範本</strong> 可建立自訂範本</li>
              <li>點擊 <strong>⭐ 設預設</strong> 可更換預設使用的範本</li>
            </ul>
          </div>
        </div>
      </section>

      {/* 費用追蹤 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">💰 費用追蹤</h2>
        <div className="text-sm text-gray-600 space-y-2">
          <p>在「費用追蹤」頁面可查看 AI 使用費用：</p>
          <ul className="list-disc list-inside ml-2 space-y-1">
            <li>總花費（USD / TWD）及各模型分別統計</li>
            <li>30 天每日費用趨勢圖</li>
            <li>每日明細（模型、請求次數、token 數、費用）</li>
          </ul>
          <p className="text-gray-500 mt-2">管理員可切換到「🌐 全站總覽」查看所有用戶的費用。</p>
        </div>
      </section>

      {/* 注意事項 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">注意事項</h2>
        <ul className="text-sm text-gray-600 space-y-3">
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>帳號核准：</strong>註冊後需等管理員核准，才能使用文章生成和 SEO 優化功能。未核准前按鈕會顯示「🔒 等待核准」。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>冷啟動延遲：</strong>雲端伺服器閒置後會休眠，首次請求可能需要 30~60 秒等待啟動，後續請求恢復正常。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>商品擷取時機：</strong>需等蝦皮商品頁完整載入後再擷取，過早點擊可能導致資料不完整。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>圖片來源：</strong>文章中的圖片連結指向蝦皮 CDN，若商品下架圖片可能失效。建議使用「📥 圖片」功能備份。</span>
          </li>
          <li className="flex gap-2">
            <span className="text-amber-500 flex-shrink-0">⚠️</span>
            <span><strong>Extension 模式：</strong>Popup 中可切換「雲端/本地」模式。線上測試請使用雲端模式。</span>
          </li>
        </ul>
      </section>
    </div>
  );
}
