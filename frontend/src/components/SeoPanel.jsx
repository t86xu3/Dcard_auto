/**
 * SEO 分析面板元件
 * 顯示 8 項 SEO 評分指標、環形分數圖、進度條 breakdown、關鍵字標籤、建議列表
 * 支援折疊：點擊標題列展開/收合
 */
import { useState } from 'react';

// 環形分數圖（SVG）
function ScoreRing({ score, maxScore, grade, size = 80 }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(score / maxScore, 1);
  const offset = circumference * (1 - pct);

  const gradeColors = {
    A: { stroke: '#22c55e', bg: '#f0fdf4', text: '#15803d' },
    B: { stroke: '#3b82f6', bg: '#eff6ff', text: '#1d4ed8' },
    C: { stroke: '#f59e0b', bg: '#fffbeb', text: '#b45309' },
    D: { stroke: '#ef4444', bg: '#fef2f2', text: '#b91c1c' },
  };
  const colors = gradeColors[grade] || gradeColors.D;

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} className="transform -rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke="#e5e7eb" strokeWidth="6" fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          stroke={colors.stroke} strokeWidth="6" fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center" style={{ width: size, height: size }}>
        <span className="text-2xl font-bold" style={{ color: colors.text }}>{Math.round(score)}</span>
      </div>
      <div>
        <div className="text-lg font-bold" style={{ color: colors.text }}>
          {grade} 等級
        </div>
        <div className="text-xs text-gray-500">
          {score >= 85 ? '優秀' : score >= 70 ? '良好' : score >= 50 ? '待改進' : '需大幅改進'}
        </div>
      </div>
    </div>
  );
}

// 進度條
function ProgressBar({ score, max, label }) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  const barColor = pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 text-gray-600 shrink-0">{label}</span>
      <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 w-12 text-right shrink-0">
        {Math.round(score)}/{max}
      </span>
    </div>
  );
}

// 關鍵字 pill
function KeywordPill({ keyword }) {
  return (
    <span className="inline-block px-2.5 py-1 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">
      {keyword}
    </span>
  );
}

/**
 * SEO 面板主元件
 * @param {Object} props
 * @param {Object} props.data - SEO 分析資料（來自後端的 analyze 結果）
 * @param {boolean} props.optimized - 是否為優化後的結果
 * @param {number} props.beforeScore - 優化前的分數（僅在 optimized 時使用）
 * @param {Object} props.beforeAnalysis - 優化前的完整分析（含 breakdown）
 */
export default function SeoPanel({ data, optimized = false, beforeScore = null, beforeAnalysis = null }) {
  const [collapsed, setCollapsed] = useState(true);

  if (!data) return null;

  // 相容舊格式：data 可能是 { breakdown: {...} } 或純 list
  const hasBreakdown = data.breakdown && typeof data.breakdown === 'object' && !Array.isArray(data.breakdown);

  // 如果是舊格式（seo_suggestions 為 list），優雅降級
  if (!hasBreakdown) {
    const suggestions = Array.isArray(data.suggestions) ? data.suggestions :
                       Array.isArray(data) ? data : [];
    const score = data.score ?? 0;
    const maxScore = data.max_score ?? 100;
    const grade = data.grade ?? (score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 50 ? 'C' : 'D');

    return (
      <div className={`rounded-xl border ${optimized ? 'bg-green-50 border-green-200' : 'bg-purple-50 border-purple-200'}`}>
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-black/5 rounded-xl transition-colors active:scale-[0.99]"
          onClick={() => setCollapsed(c => !c)}
        >
          <span className={`font-semibold ${optimized ? 'text-green-800' : 'text-purple-800'}`}>
            {optimized ? 'SEO 優化完成' : 'SEO 分析結果'}
          </span>
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${optimized ? 'text-green-600' : 'text-purple-600'}`}>
              {score} / {maxScore} ({grade})
            </span>
            <span className={`text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}>▾</span>
          </div>
        </div>
        {!collapsed && suggestions.length > 0 && (
          <div className="px-4 pb-4">
            <ul className="text-sm text-purple-700 space-y-1">
              {suggestions.map((s, i) => <li key={i}>• {s}</li>)}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const { score, max_score: maxScore, grade, breakdown, suggestions, keywords } = data;
  const breakdownOrder = [
    'title_seo', 'keyword_density', 'keyword_placement', 'content_structure',
    'content_length', 'faq_quality', 'media_usage', 'readability'
  ];

  return (
    <div className={`rounded-xl border ${optimized ? 'bg-green-50 border-green-200' : 'bg-purple-50 border-purple-200'}`}>
      {/* Header: 可點擊折疊 */}
      <div
        className="flex items-center justify-between p-5 cursor-pointer hover:bg-black/5 rounded-xl transition-colors active:scale-[0.99]"
        onClick={() => setCollapsed(c => !c)}
      >
        <span className={`font-semibold text-base ${optimized ? 'text-green-800' : 'text-purple-800'}`}>
          {optimized ? 'SEO 優化完成' : 'SEO 分析'}
        </span>
        <div className="flex items-center gap-3">
          <div className="text-right">
            {optimized && beforeScore != null ? (
              <div className="text-sm text-gray-500">
                {beforeScore} → {score}
                {score > beforeScore
                  ? ` (+${(score - beforeScore).toFixed(1)})`
                  : score < beforeScore
                    ? ` (${(score - beforeScore).toFixed(1)})`
                    : ' (不變)'}
              </div>
            ) : (
              <span className={`text-lg font-bold ${
                grade === 'A' ? 'text-green-600' : grade === 'B' ? 'text-blue-600' : grade === 'C' ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {Math.round(score)} 分 ({grade})
              </span>
            )}
          </div>
          <span className={`text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}>▾</span>
        </div>
      </div>

      {/* 可折疊內容 */}
      {!collapsed && (
        <div className="px-5 pb-5">
          {/* 分數環 */}
          <div className="relative flex justify-center mb-5">
            <ScoreRing score={score} maxScore={maxScore} grade={grade} />
          </div>

          {/* Breakdown 進度條 */}
          <div className="space-y-2.5 mb-4">
            {breakdownOrder.map(key => {
              const item = breakdown[key];
              if (!item) return null;
              return (
                <ProgressBar
                  key={key}
                  score={item.score}
                  max={item.max}
                  label={item.label}
                />
              );
            })}
          </div>

          {/* 優化前後對比（每項差異） */}
          {optimized && beforeAnalysis?.breakdown && (
            <div className="mb-4 p-3 bg-white/60 rounded-lg">
              <div className="text-xs font-medium text-gray-500 mb-2">各項變化</div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                {breakdownOrder.map(key => {
                  const after = breakdown[key];
                  const before = beforeAnalysis.breakdown[key];
                  if (!after || !before) return null;
                  const diff = after.score - before.score;
                  if (diff === 0) return null;
                  return (
                    <div key={key} className="flex justify-between">
                      <span className="text-gray-600">{after.label}</span>
                      <span className={diff > 0 ? 'text-green-600' : 'text-red-600'}>
                        {diff > 0 ? '+' : ''}{diff.toFixed(1)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 關鍵字標籤 */}
          {keywords?.length > 0 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-500 mb-2">提取的關鍵字</div>
              <div className="flex flex-wrap gap-1.5">
                {keywords.slice(0, 8).map((kw, i) => <KeywordPill key={i} keyword={kw} />)}
              </div>
            </div>
          )}

          {/* 建議列表 */}
          {suggestions?.length > 0 && (
            <div>
              <div className="text-xs font-medium text-gray-500 mb-2">改善建議</div>
              <ul className="space-y-1.5">
                {suggestions.map((s, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-sm text-gray-700">
                    <span className="shrink-0">{i < 2 ? '⚠️' : '💡'}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
