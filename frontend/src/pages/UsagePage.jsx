import { useState, useEffect } from 'react';
import { getUsage } from '../api/client';

const MODEL_COLORS = {
  'google/gemini-2.5-flash': { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  'google/gemini-2.5-pro': { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
};

const DEFAULT_COLOR = { bg: 'bg-gray-50', text: 'text-gray-700', bar: 'bg-gray-500', badge: 'bg-gray-100 text-gray-700' };

function getColor(provider, model) {
  return MODEL_COLORS[`${provider}/${model}`] || DEFAULT_COLOR;
}

function formatTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export default function UsagePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUsage()
      .then(setData)
      .catch(err => console.error('載入用量失敗:', err))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-gray-400">載入中...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📊</div>
          <p>無法載入用量資料</p>
        </div>
      </div>
    );
  }

  const { by_model, total_cost_usd, total_cost_twd, history } = data;
  const maxDailyCost = Math.max(...(history.map(h => h.daily_total_usd) || [0]), 0.001);

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">費用追蹤</h2>

      {/* 總花費摘要 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-500 mb-1">總花費 (USD)</div>
          <div className="text-2xl font-bold text-gray-800">${total_cost_usd.toFixed(4)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-500 mb-1">總花費 (TWD)</div>
          <div className="text-2xl font-bold text-gray-800">NT${total_cost_twd.toFixed(2)}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="text-sm text-gray-500 mb-1">使用模型數</div>
          <div className="text-2xl font-bold text-gray-800">{by_model.length}</div>
        </div>
      </div>

      {/* 按模型分類 */}
      {by_model.length > 0 ? (
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">各模型統計</h3>
          <div className="space-y-4">
            {by_model.map((m) => {
              const color = getColor(m.provider, m.model);
              return (
                <div key={`${m.provider}/${m.model}`} className={`${color.bg} rounded-lg p-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color.badge}`}>
                        {m.provider}
                      </span>
                      <span className={`font-semibold ${color.text}`}>{m.model}</span>
                    </div>
                    <span className={`text-lg font-bold ${color.text}`}>${m.cost_usd.toFixed(4)}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">請求次數</span>
                      <div className="font-medium text-gray-800">{m.requests}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">輸入 tokens</span>
                      <div className="font-medium text-gray-800">{formatTokens(m.input_tokens)}</div>
                    </div>
                    <div>
                      <span className="text-gray-500">輸出 tokens</span>
                      <div className="font-medium text-gray-800">{formatTokens(m.output_tokens)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="text-center py-8 text-gray-400">
            <div className="text-4xl mb-3">📭</div>
            <p>尚無使用紀錄</p>
            <p className="text-sm mt-1">生成文章後會在此顯示費用統計</p>
          </div>
        </section>
      )}

      {/* 30 天趨勢 */}
      {history.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">30 天趨勢</h3>
          <div className="flex items-end gap-1" style={{ height: '160px' }}>
            {history.slice(0, 30).reverse().map((day) => {
              const heightPct = Math.max((day.daily_total_usd / maxDailyCost) * 100, 2);
              const models = Object.keys(day.models);
              const barColor = models.length === 1
                ? (getColor(...models[0].split('/')).bar)
                : 'bg-gradient-to-t from-blue-500 to-purple-500';
              return (
                <div key={day.date} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className={`w-full rounded-t ${barColor} min-w-[4px] transition-all group-hover:opacity-80`}
                    style={{ height: `${heightPct}%` }}
                  />
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="bg-gray-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                      <div className="font-medium mb-1">{day.date}</div>
                      <div>${day.daily_total_usd.toFixed(4)}</div>
                      {Object.entries(day.models).map(([key, val]) => (
                        <div key={key} className="text-gray-300">
                          {key.split('/')[1]}: ${val.cost_usd.toFixed(4)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>{history[history.length - 1]?.date}</span>
            <span>{history[0]?.date}</span>
          </div>
        </section>
      )}

      {/* 詳細表格 */}
      {history.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-lg font-semibold text-gray-800">每日明細</h3>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="p-3">日期</th>
                <th className="p-3">模型</th>
                <th className="p-3 text-right">請求</th>
                <th className="p-3 text-right">輸入</th>
                <th className="p-3 text-right">輸出</th>
                <th className="p-3 text-right">費用</th>
              </tr>
            </thead>
            <tbody>
              {history.map((day) =>
                Object.entries(day.models).map(([modelKey, val], idx) => {
                  const [provider, model] = modelKey.split('/');
                  const color = getColor(provider, model);
                  return (
                    <tr key={`${day.date}-${modelKey}`} className="border-t border-gray-50 hover:bg-gray-50">
                      <td className="p-3 text-gray-600">
                        {idx === 0 ? day.date : ''}
                      </td>
                      <td className="p-3">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${color.badge}`}>{model}</span>
                      </td>
                      <td className="p-3 text-right text-gray-800">{val.requests}</td>
                      <td className="p-3 text-right text-gray-600">{formatTokens(val.input_tokens)}</td>
                      <td className="p-3 text-right text-gray-600">{formatTokens(val.output_tokens)}</td>
                      <td className="p-3 text-right font-medium text-gray-800">${val.cost_usd.toFixed(4)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
