import { useState, useEffect } from 'react';
import { getProducts, getArticles, getAnnouncements } from '../api/client';
import { useExtensionDetect } from '../hooks/useExtensionDetect';
import { formatDateTime } from '../utils/datetime';

export default function DashboardPage() {
  const [stats, setStats] = useState({ products: 0, articles: 0 });
  const [announcements, setAnnouncements] = useState([]);
  const { status, extensionInfo, retry } = useExtensionDetect();

  useEffect(() => {
    // 基本統計
    Promise.all([
      getProducts().catch(() => []),
      getArticles().catch(() => []),
    ]).then(([products, articles]) => {
      setStats({
        products: products.length,
        articles: articles.length,
      });
    });

    // 公告
    getAnnouncements().then(setAnnouncements).catch(() => {});
  }, []);

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-6">儀表板</h2>

      {/* 公告區塊 */}
      {announcements.length > 0 && (
        <div className="space-y-3 mb-6">
          {announcements.map((a) => (
            <div
              key={a.id}
              className="bg-blue-50 border border-blue-200 rounded-xl p-4"
            >
              <div className="flex items-start gap-3">
                <span className="text-xl mt-0.5">📢</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-blue-800">{a.title}</h3>
                  <p className="text-sm text-blue-700 mt-1 whitespace-pre-wrap">{a.content}</p>
                  <span className="text-xs text-blue-400 mt-2 block">
                    {formatDateTime(a.created_at)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
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

    </div>
  );
}

function StatCard({ title, value, icon, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
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
    </div>
  );
}

