import { useState, useEffect } from 'react';
import { getUsage, getAdminUsage } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

const MODEL_COLORS = {
  'google/gemini-2.5-flash': { bg: 'bg-blue-50', text: 'text-blue-700', bar: 'bg-blue-500', badge: 'bg-blue-100 text-blue-700' },
  'google/gemini-2.5-pro': { bg: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-500', badge: 'bg-purple-100 text-purple-700' },
  'google/gemini-3-pro-preview': { bg: 'bg-amber-50', text: 'text-amber-700', bar: 'bg-amber-500', badge: 'bg-amber-100 text-amber-700' },
  'anthropic/claude-sonnet-4-5': { bg: 'bg-orange-50', text: 'text-orange-700', bar: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700' },
  'anthropic/claude-haiku-4-5': { bg: 'bg-teal-50', text: 'text-teal-700', bar: 'bg-teal-500', badge: 'bg-teal-100 text-teal-700' },
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

function getDefaultStartDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function getDefaultEndDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function UsagePage() {
  const { user } = useAuth();
  const isAdmin = user?.is_admin;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('my'); // 'my' | 'all'
  const [startDate, setStartDate] = useState(getDefaultStartDate);
  const [endDate, setEndDate] = useState(getDefaultEndDate);
  const [filterLoading, setFilterLoading] = useState(false);

  useEffect(() => {
    if (isAdmin && viewMode === 'all') {
      getAdminUsage({ startDate, endDate })
        .then(d => { setData(d); setLoading(false); })
        .catch(err => { console.error('載入用量失敗:', err); setLoading(false); });
    } else {
      getUsage()
        .then(d => { setData(d); setLoading(false); })
        .catch(err => { console.error('載入用量失敗:', err); setLoading(false); });
    }
  }, [viewMode, isAdmin]);

  const handleDateFilter = () => {
    setFilterLoading(true);
    getAdminUsage({ startDate, endDate })
      .then(d => {
        setData(prev => ({ ...prev, by_user: d.by_user }));
        setFilterLoading(false);
      })
      .catch(err => { console.error('篩選失敗:', err); setFilterLoading(false); });
  };

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
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">費用追蹤</h2>
        {isAdmin && (
          <div className="flex bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('my')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all active:scale-95 ${
                viewMode === 'my' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              👤 我的用量
            </button>
            <button
              onClick={() => setViewMode('all')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all active:scale-95 ${
                viewMode === 'all' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🌐 全站總覽
            </button>
          </div>
        )}
      </div>

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

      {/* 管理員：各用戶使用量 */}
      {viewMode === 'all' && data.by_user && data.by_user.length > 0 && (
        <section className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          <div className="p-4 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h3 className="text-lg font-semibold text-gray-800">各用戶使用量</h3>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <span className="text-gray-400 text-sm">至</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <button
                  onClick={handleDateFilter}
                  disabled={filterLoading}
                  className="px-3 py-1.5 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-50"
                >
                  {filterLoading ? '篩選中...' : '🔍 篩選'}
                </button>
              </div>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="p-3">用戶</th>
                <th className="p-3 text-right">請求次數</th>
                <th className="p-3 text-right">輸入 tokens</th>
                <th className="p-3 text-right">輸出 tokens</th>
                <th className="p-3 text-right">費用 (USD)</th>
                <th className="p-3 text-right">費用 (TWD)</th>
              </tr>
            </thead>
            <tbody>
              {data.by_user.map((u) => {
                const totalRequests = u.models.reduce((s, m) => s + m.requests, 0);
                const totalInput = u.models.reduce((s, m) => s + m.input_tokens, 0);
                const totalOutput = u.models.reduce((s, m) => s + m.output_tokens, 0);
                return (
                  <tr key={u.user_id} className="border-t border-gray-100 hover:bg-gray-50 group">
                    <td className="p-3">
                      <div className="font-medium text-gray-800">{u.username}</div>
                      <div className="text-xs text-gray-400">ID: {u.user_id}</div>
                    </td>
                    <td className="p-3 text-right text-gray-800">{totalRequests}</td>
                    <td className="p-3 text-right text-gray-600">{formatTokens(totalInput)}</td>
                    <td className="p-3 text-right text-gray-600">{formatTokens(totalOutput)}</td>
                    <td className="p-3 text-right font-medium text-gray-800">${u.total_cost_usd.toFixed(4)}</td>
                    <td className="p-3 text-right font-medium text-gray-800">NT${u.total_cost_twd.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* 展開的模型明細 */}
          <div className="divide-y divide-gray-100 border-t border-gray-200">
            {data.by_user.map((u) => (
              <div key={`detail-${u.user_id}`} className="px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-700">{u.username}</span>
                  <span className="text-xs text-gray-400">模型明細</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {u.models.map((m) => {
                    const color = getColor(m.provider, m.model);
                    return (
                      <div key={`${m.provider}/${m.model}`} className={`${color.bg} rounded-lg px-3 py-2 text-xs`}>
                        <span className={`font-medium ${color.text}`}>{m.model}</span>
                        <span className="text-gray-500 ml-2">{m.requests} 次 · {formatTokens(m.input_tokens)}↑ {formatTokens(m.output_tokens)}↓ · ${m.cost_usd.toFixed(4)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
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
