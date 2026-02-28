import { useState } from 'react';
import { researchKeywords } from '../api/client';

const INTENT_LABELS = {
  commercial: '商業',
  informational: '資訊',
  comparative: '比較',
  navigational: '導航',
};

const DIFFICULTY_LABELS = {
  easy: { text: '低', color: 'text-green-700 bg-green-100' },
  medium: { text: '中', color: 'text-yellow-700 bg-yellow-100' },
  hard: { text: '高', color: 'text-red-700 bg-red-100' },
};

export default function KeywordResearchPanel({
  selectedProductIds,
  keywordStrategy,
  onStrategyChange,
  isApproved,
  showToast,
}) {
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleResearch = async () => {
    if (!selectedProductIds || selectedProductIds.length < 1) return;
    setLoading(true);
    try {
      const strategy = await researchKeywords(selectedProductIds);
      onStrategyChange(strategy);
      showToast('success', 'SEO 關鍵字研究完成！');
      setCollapsed(false);
    } catch (err) {
      showToast('error', '關鍵字研究失敗: ' + (err.response?.data?.detail || err.message));
    }
    setLoading(false);
  };

  const handleClear = () => {
    onStrategyChange(null);
  };

  if (!isApproved) return null;

  return (
    <div className="mb-4 px-4 pb-4 pt-2 bg-blue-50 border border-blue-200 rounded-xl">
      <div
        className="flex items-center justify-between cursor-pointer select-none"
        onClick={() => keywordStrategy && setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-blue-700">
            🔍 SEO 關鍵字研究
          </span>
          <span className="text-xs text-blue-500">
            {keywordStrategy ? '已完成' : '分析搜尋趨勢，提升文章排名'}
          </span>
        </div>
        {keywordStrategy && (
          <span className="text-xs text-blue-400">
            {collapsed ? '▸ 展開' : '▾ 收合'}
          </span>
        )}
      </div>

      {/* 無策略時：操作按鈕 */}
      {!keywordStrategy && !loading && (
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handleResearch}
            disabled={!selectedProductIds || selectedProductIds.length < 1}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            🔍 一鍵研究關鍵字
          </button>
          <span className="text-xs text-gray-400">
            約 30-60 秒 | 費用 ~NT$0.03
          </span>
        </div>
      )}

      {/* Loading 狀態 */}
      {loading && (
        <div className="flex items-center gap-3 mt-3">
          <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-sm text-blue-600">
            研究中...正在分析搜尋趨勢（約 30-60 秒）
          </span>
        </div>
      )}

      {/* 研究結果 */}
      {keywordStrategy && !collapsed && (
        <div className="mt-3 space-y-3">
          {/* 主關鍵字 */}
          <div>
            <span className="text-xs text-gray-500 mr-2">🎯 主關鍵字</span>
            <span className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
              {keywordStrategy.primary_keyword}
            </span>
            {keywordStrategy.primary_keyword_reason && (
              <span className="text-xs text-gray-400 ml-2">
                {keywordStrategy.primary_keyword_reason}
              </span>
            )}
          </div>

          {/* 次要關鍵字 */}
          {keywordStrategy.secondary_keywords?.length > 0 && (
            <div>
              <span className="text-xs text-gray-500 mr-2">📋 次要關鍵字</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {keywordStrategy.secondary_keywords.map((kw, i) => {
                  const keyword = typeof kw === 'string' ? kw : kw.keyword;
                  const intent = typeof kw === 'object' ? kw.intent : null;
                  return (
                    <span
                      key={i}
                      className="inline-block px-2.5 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs"
                      title={typeof kw === 'object' ? kw.reason : ''}
                    >
                      {keyword}
                      {intent && (
                        <span className="ml-1 opacity-60">
                          ({INTENT_LABELS[intent] || intent})
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* 長尾關鍵字 */}
          {keywordStrategy.long_tail_keywords?.length > 0 && (
            <div>
              <span className="text-xs text-gray-500 mr-2">🔗 長尾關鍵字</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {keywordStrategy.long_tail_keywords.map((kw, i) => (
                  <span
                    key={i}
                    className="inline-block px-2.5 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 建議標題 */}
          {keywordStrategy.title_suggestion && (
            <div>
              <span className="text-xs text-gray-500 mr-2">💡 建議標題</span>
              <div className="mt-1 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-800">
                {keywordStrategy.title_suggestion}
              </div>
            </div>
          )}

          {/* FAQ 問題 */}
          {keywordStrategy.faq_questions?.length > 0 && (
            <div>
              <span className="text-xs text-gray-500">❓ FAQ 問題</span>
              <ul className="mt-1 space-y-1 text-sm text-gray-700">
                {keywordStrategy.faq_questions.map((faq, i) => {
                  const question = typeof faq === 'string' ? faq : faq.question;
                  const source = typeof faq === 'object' ? faq.source : null;
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-gray-400 flex-shrink-0">Q{i + 1}.</span>
                      <span>{question}</span>
                      {source && (
                        <span className="text-xs text-gray-400 flex-shrink-0">
                          [{source}]
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* 語義相關詞 */}
          {keywordStrategy.semantic_related?.length > 0 && (
            <div>
              <span className="text-xs text-gray-500 mr-2">🌐 語義相關詞</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {keywordStrategy.semantic_related.map((kw, i) => (
                  <span
                    key={i}
                    className="inline-block px-2.5 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs"
                  >
                    {kw}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 難度評估 */}
          {keywordStrategy.estimated_difficulty && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">📊 競爭難度</span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  DIFFICULTY_LABELS[keywordStrategy.estimated_difficulty]?.color || 'bg-gray-100 text-gray-600'
                }`}
              >
                {DIFFICULTY_LABELS[keywordStrategy.estimated_difficulty]?.text || keywordStrategy.estimated_difficulty}
              </span>
              {keywordStrategy.difficulty_reason && (
                <span className="text-xs text-gray-400">
                  {keywordStrategy.difficulty_reason}
                </span>
              )}
            </div>
          )}

          {/* 操作按鈕 */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleResearch}
              disabled={loading}
              className="px-3 py-1.5 bg-blue-100 text-blue-700 text-xs rounded-lg hover:bg-blue-200 active:scale-95 transition-all"
            >
              🔄 重新研究
            </button>
            <button
              onClick={handleClear}
              className="px-3 py-1.5 bg-red-50 text-red-600 text-xs rounded-lg hover:bg-red-100 active:scale-95 transition-all"
            >
              🗑️ 清除
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
