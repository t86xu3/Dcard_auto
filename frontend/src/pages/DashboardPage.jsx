import { useState, useEffect } from 'react';
import { getProducts, getArticles, getShopeeOffers, getShopOffers, getProductOffers, getAnnouncements } from '../api/client';
import { useExtensionDetect } from '../hooks/useExtensionDetect';
import { formatDateTime } from '../utils/datetime';

export default function DashboardPage() {
  const [stats, setStats] = useState({ products: 0, articles: 0 });
  const [shopeeOffers, setShopeeOffers] = useState(null);
  const [shopOffers, setShopOffers] = useState(null);
  const [productOffers, setProductOffers] = useState(null);
  const [affiliateLoading, setAffiliateLoading] = useState(true);
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

    // 聯盟行銷資料
    Promise.all([
      getShopeeOffers().catch(() => []),
      getShopOffers().catch(() => []),
      getProductOffers().catch(() => []),
    ]).then(([shopee, shop, product]) => {
      setShopeeOffers(shopee);
      setShopOffers(shop);
      setProductOffers(product);
      setAffiliateLoading(false);
    });
  }, []);

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">儀表板</h2>

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

      {/* 蝦皮聯盟行銷資料 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 平台促銷活動 */}
        <AffiliateSection
          title="🎪 平台促銷活動"
          bgColor="bg-orange-50"
          borderColor="border-orange-200"
          accentColor="text-orange-600"
          loading={affiliateLoading}
          data={shopeeOffers}
          renderItem={(item) => (
            <a
              href={item.offerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg hover:bg-orange-100 transition-colors active:scale-[0.98]"
            >
              <div className="font-medium text-gray-800 text-sm truncate">{item.offerName}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-orange-600 font-semibold text-sm">佣金 {item.commissionRate}%</span>
                <span className="text-xs text-gray-400">
                  {formatTimestamp(item.periodStartTime)} ~ {formatTimestamp(item.periodEndTime)}
                </span>
              </div>
            </a>
          )}
        />

        {/* 商店佣金優惠 */}
        <AffiliateSection
          title="🏪 商店佣金優惠"
          bgColor="bg-amber-50"
          borderColor="border-amber-200"
          accentColor="text-amber-600"
          loading={affiliateLoading}
          data={shopOffers}
          renderItem={(item) => (
            <a
              href={item.offerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg hover:bg-amber-100 transition-colors active:scale-[0.98]"
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 text-sm truncate">{item.shopName}</span>
                {item.shopType === 1 && <ShopBadge label="Mall" color="red" />}
                {item.shopType === 2 && <ShopBadge label="Star" color="yellow" />}
                {item.shopType === 4 && <ShopBadge label="Star+" color="purple" />}
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-amber-600 font-semibold text-sm">佣金 {item.commissionRate}%</span>
                {item.ratingStar > 0 && (
                  <span className="text-xs text-gray-400">⭐ {item.ratingStar.toFixed(1)}</span>
                )}
              </div>
            </a>
          )}
        />

        {/* 高佣金商品 */}
        <AffiliateSection
          title="💰 高佣金商品"
          bgColor="bg-cyan-50"
          borderColor="border-cyan-200"
          accentColor="text-cyan-600"
          loading={affiliateLoading}
          data={productOffers}
          renderItem={(item) => (
            <a
              href={item.offerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 rounded-lg hover:bg-cyan-100 transition-colors active:scale-[0.98]"
            >
              <div className="font-medium text-gray-800 text-sm truncate">{item.productName}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-cyan-600 font-semibold text-sm">佣金 {item.commissionRate}%</span>
                <span className="text-xs text-gray-500">
                  ${item.priceMin?.toFixed(0)}{item.priceMax > item.priceMin ? `~$${item.priceMax?.toFixed(0)}` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between mt-0.5">
                {item.commission > 0 && (
                  <span className="text-xs text-green-600">預估 ${item.commission?.toFixed(0)}</span>
                )}
                {item.sales > 0 && (
                  <span className="text-xs text-gray-400">銷量 {item.sales.toLocaleString()}</span>
                )}
              </div>
            </a>
          )}
        />
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

function AffiliateSection({ title, bgColor, borderColor, accentColor, loading, data, renderItem }) {
  return (
    <div className={`${bgColor} rounded-xl border ${borderColor} p-5`}>
      <h3 className={`text-base font-semibold ${accentColor} mb-3`}>{title}</h3>
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          <span className="ml-2 text-sm text-gray-500">載入中...</span>
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          暫無資料（API 未設定或無可用優惠）
        </div>
      ) : (
        <div className="space-y-1">
          {data.map((item, idx) => (
            <div key={idx}>{renderItem(item)}</div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShopBadge({ label, color }) {
  const colors = {
    red: 'bg-red-100 text-red-600',
    yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-600',
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${colors[color]}`}>
      {label}
    </span>
  );
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
