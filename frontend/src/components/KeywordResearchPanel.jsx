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

/* ── 可編輯標籤列 ── */
function TagEditor({ items, onUpdate, colorClass, placeholder }) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const val = input.trim();
    if (!val || items.includes(val)) return;
    onUpdate([...items, val]);
    setInput('');
  };

  const handleRemove = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  return (
    <div className="flex flex-wrap gap-1.5 mt-1 items-center">
      {items.map((item, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-0.5 px-2.5 py-0.5 ${colorClass} rounded-full text-xs group`}
        >
          {item}
          <button
            onClick={() => handleRemove(i)}
            className="opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-0.5 text-current leading-none"
            title="移除"
          >
            ×
          </button>
        </span>
      ))}
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
        placeholder={placeholder || '新增...'}
        className="w-24 px-2 py-0.5 text-xs border border-dashed border-gray-300 rounded-full focus:outline-none focus:border-blue-400 bg-transparent"
      />
    </div>
  );
}

/* ── FAQ 編輯器 ── */
function FaqEditor({ items, onUpdate }) {
  const [input, setInput] = useState('');

  const handleAdd = () => {
    const val = input.trim();
    if (!val) return;
    onUpdate([...items, { question: val, source: 'manual', target_keyword: '' }]);
    setInput('');
  };

  const handleRemove = (index) => {
    onUpdate(items.filter((_, i) => i !== index));
  };

  const handleChange = (index, newQuestion) => {
    const updated = [...items];
    if (typeof updated[index] === 'object') {
      updated[index] = { ...updated[index], question: newQuestion };
    } else {
      updated[index] = newQuestion;
    }
    onUpdate(updated);
  };

  return (
    <div className="mt-1 space-y-1.5">
      {items.map((faq, i) => {
        const question = typeof faq === 'string' ? faq : faq.question;
        const source = typeof faq === 'object' ? faq.source : null;
        return (
          <div key={i} className="flex items-center gap-2 group">
            <span className="text-gray-400 text-sm flex-shrink-0 w-8">
              Q{i + 1}.
            </span>
            <input
              value={question}
              onChange={(e) => handleChange(i, e.target.value)}
              className="flex-1 text-sm text-gray-700 bg-transparent border-b border-transparent hover:border-gray-200 focus:border-blue-400 focus:outline-none py-0.5"
            />
            {source && (
              <span className="text-xs text-gray-400 flex-shrink-0">
                [{source}]
              </span>
            )}
            <button
              onClick={() => handleRemove(i)}
              className="opacity-0 group-hover:opacity-60 hover:!opacity-100 text-red-400 text-sm flex-shrink-0"
              title="移除"
            >
              ×
            </button>
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <span className="text-gray-300 text-sm flex-shrink-0 w-8">+</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="新增 FAQ 問題..."
          className="flex-1 text-sm text-gray-500 bg-transparent border-b border-dashed border-gray-200 focus:border-blue-400 focus:outline-none py-0.5"
        />
      </div>
    </div>
  );
}

export default function KeywordResearchPanel({
  selectedProductIds,
  keywordStrategy,
  onStrategyChange,
  isApproved,
  showToast,
}) {
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const updateField = (field, value) => {
    onStrategyChange({ ...keywordStrategy, [field]: value });
  };

  const handleResearch = async () => {
    if (!selectedProductIds || selectedProductIds.length < 1) return;
    setLoading(true);
    try {
      const strategy = await researchKeywords(selectedProductIds);
      onStrategyChange(strategy);
      showToast('success', 'SEO 關鍵字研究完成！');
      setCollapsed(false);
    } catch (err) {
      showToast(
        'error',
        '關鍵字研究失敗: ' +
          (err.response?.data?.detail || err.message),
      );
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
            {keywordStrategy
              ? '已完成（可直接編輯內容）'
              : '分析 Google 搜尋趨勢，自動產出關鍵字策略'}
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
            約 30-90 秒 | 費用 ~NT$0.1
          </span>
        </div>
      )}

      {/* Loading 狀態 */}
      {loading && (
        <div className="flex items-center gap-3 mt-3">
          <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full" />
          <span className="text-sm text-blue-600">
            研究中...正在分析搜尋趨勢（約 30-90 秒）
          </span>
        </div>
      )}

      {/* 研究結果（可編輯） */}
      {keywordStrategy && !collapsed && (
        <div className="mt-3 space-y-3">
          {/* 主關鍵字 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">🎯 主關鍵字</span>
            <input
              value={keywordStrategy.primary_keyword || ''}
              onChange={(e) => updateField('primary_keyword', e.target.value)}
              className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium border border-transparent focus:border-green-400 focus:outline-none"
              size={Math.max((keywordStrategy.primary_keyword || '').length + 1, 4)}
            />
          </div>

          {/* 次要關鍵字 */}
          <div>
            <span className="text-xs text-gray-500 mr-2">📋 次要關鍵字</span>
            <TagEditor
              items={(keywordStrategy.secondary_keywords || []).map((kw) =>
                typeof kw === 'string' ? kw : kw.keyword,
              )}
              onUpdate={(newItems) => {
                const existing = keywordStrategy.secondary_keywords || [];
                const updated = newItems.map((keyword) => {
                  const found = existing.find(
                    (e) => (typeof e === 'string' ? e : e.keyword) === keyword,
                  );
                  return found || { keyword, intent: 'commercial', reason: '' };
                });
                updateField('secondary_keywords', updated);
              }}
              colorClass="bg-blue-100 text-blue-800"
              placeholder="新增次要詞..."
            />
          </div>

          {/* 長尾關鍵字 */}
          <div>
            <span className="text-xs text-gray-500 mr-2">🔗 長尾關鍵字</span>
            <TagEditor
              items={keywordStrategy.long_tail_keywords || []}
              onUpdate={(newItems) =>
                updateField('long_tail_keywords', newItems)
              }
              colorClass="bg-purple-100 text-purple-800"
              placeholder="新增長尾詞..."
            />
          </div>

          {/* 建議標題 */}
          <div>
            <span className="text-xs text-gray-500 mr-2">💡 建議標題</span>
            <input
              value={keywordStrategy.title_suggestion || ''}
              onChange={(e) => updateField('title_suggestion', e.target.value)}
              className="mt-1 w-full px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-800 border border-transparent focus:border-blue-400 focus:outline-none"
            />
          </div>

          {/* FAQ 問題 */}
          <div>
            <span className="text-xs text-gray-500">❓ FAQ 問題</span>
            <FaqEditor
              items={keywordStrategy.faq_questions || []}
              onUpdate={(newItems) => updateField('faq_questions', newItems)}
            />
          </div>

          {/* 語義相關詞 */}
          <div>
            <span className="text-xs text-gray-500 mr-2">🌐 語義相關詞</span>
            <TagEditor
              items={keywordStrategy.semantic_related || []}
              onUpdate={(newItems) =>
                updateField('semantic_related', newItems)
              }
              colorClass="bg-gray-100 text-gray-600"
              placeholder="新增相關詞..."
            />
          </div>

          {/* 難度評估 */}
          {keywordStrategy.estimated_difficulty && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">📊 競爭難度</span>
              <span
                className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                  DIFFICULTY_LABELS[keywordStrategy.estimated_difficulty]
                    ?.color || 'bg-gray-100 text-gray-600'
                }`}
              >
                {DIFFICULTY_LABELS[keywordStrategy.estimated_difficulty]
                  ?.text || keywordStrategy.estimated_difficulty}
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
