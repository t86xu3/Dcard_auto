import { useState, useEffect } from 'react';
import { getProducts, getArticles, getUsage } from '../api/client';
import { useExtensionDetect } from '../hooks/useExtensionDetect';

export default function DashboardPage() {
  const [stats, setStats] = useState({ products: 0, articles: 0 });
  const [usage, setUsage] = useState(null);
  const { status, extensionInfo, retry } = useExtensionDetect();

  useEffect(() => {
    Promise.all([
      getProducts().catch(() => []),
      getArticles().catch(() => []),
      getUsage().catch(() => null),
    ]).then(([products, articles, usageData]) => {
      setStats({
        products: products.length,
        articles: articles.length,
      });
      setUsage(usageData);
    });
  }, []);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">儀表板</h2>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard
          title="商品數量"
          value={stats.products}
          icon="🛒"
          color="blue"
        />
        <StatCard
          title="文章數量"
          value={stats.articles}
          icon="📝"
          color="green"
        />
        <StatCard
          title="API 請求 (今日)"
          value={usage?.requests?.used || 0}
          icon="📡"
          color="purple"
          sub={usage ? `${usage.requests?.remaining || 0} 剩餘` : '載入中...'}
        />
      </div>

      {/* Extension Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Chrome Extension 狀態</h3>
        <div className="flex items-center gap-3">
          {status === 'installed' && (
            <>
              <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-600 font-medium">已連線</span>
              {extensionInfo && (
                <span className="text-sm text-gray-400">
                  {extensionInfo.name} v{extensionInfo.version}
                </span>
              )}
            </>
          )}
          {status === 'checking' && (
            <>
              <span className="w-3 h-3 rounded-full bg-yellow-400 animate-pulse" />
              <span className="text-yellow-600">偵測中...</span>
            </>
          )}
          {status === 'not_installed' && (
            <>
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="text-red-500">未偵測到</span>
              <button
                onClick={retry}
                className="ml-2 text-sm text-blue-500 hover:underline active:scale-95 transition-transform inline-block"
              >
                🔄 重試
              </button>
            </>
          )}
        </div>
      </div>

      {/* Usage Details */}
      {usage && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">API 用量 ({usage.date})</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-500 mb-1">請求次數</div>
              <div className="text-xl font-bold text-gray-800">
                {usage.requests?.used} / {usage.requests?.limit}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${Math.min(100, usage.requests?.percentage || 0)}%` }}
                />
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-500 mb-1">Token 用量</div>
              <div className="text-xl font-bold text-gray-800">
                {(usage.tokens?.total || 0).toLocaleString()}
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mt-2">
                <div
                  className="bg-purple-500 h-2 rounded-full"
                  style={{ width: `${Math.min(100, usage.tokens?.percentage || 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ title, value, icon, color, sub }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{title}</span>
        <span className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${colors[color]}`}>
          {icon}
        </span>
      </div>
      <div className="text-3xl font-bold text-gray-800">{value}</div>
      {sub && <div className="text-sm text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}
