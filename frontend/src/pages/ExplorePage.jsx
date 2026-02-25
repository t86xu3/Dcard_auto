import { useState, useCallback, useEffect, useRef } from 'react';
import { exploreProducts, importAffiliateUrls } from '../api/client';

const TABS = [
  {
    key: 'hot',
    label: '🔥 熱門商品',
    params: { sort_type: 2, list_type: 2, limit: 50 },
    desc: '高銷量 + 表現最佳',
  },
  {
    key: 'potential',
    label: '🌱 潛在熱門',
    params: { sort_type: 2, list_type: 0, min_commission_rate: 3, min_sales: 10, max_sales: 5000, limit: 50 },
    desc: '有佣金 + 有銷量但未爆量',
  },
  {
    key: 'high_commission',
    label: '💰 高分潤',
    params: { sort_type: 5, list_type: 0, limit: 50 },
    desc: '按佣金率排序',
  },
  {
    key: 'custom',
    label: '🔧 自定義查詢',
    params: {},
    desc: '自由組合所有篩選條件',
  },
];

const SORT_OPTIONS = [
  { value: 1, label: '相關度' },
  { value: 2, label: '銷量' },
  { value: 3, label: '價格（低→高）' },
  { value: 4, label: '價格（高→低）' },
  { value: 5, label: '佣金率' },
];

const LIST_OPTIONS = [
  { value: 0, label: '推薦' },
  { value: 2, label: '表現最佳' },
];

function ShopBadge({ shopType }) {
  // shopType 是 Array[Int]，如 [1]
  const types = Array.isArray(shopType) ? shopType : [];
  if (types.includes(1)) return <span className="text-[10px] px-1.5 py-0.5 bg-orange-100 text-orange-600 rounded font-medium">蝦皮商城</span>;
  if (types.includes(2)) return <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-medium">優選賣家</span>;
  return null;
}

function ProductCard({ item, onImport, importing }) {
  const price = item._price || 0;
  const commPct = item._commissionPct || 0;
  const sales = item._sales || 0;
  const rating = item._rating || 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* 圖片 */}
      <div className="aspect-square bg-gray-50 relative overflow-hidden">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.productName}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl text-gray-300">📦</div>
        )}
        {/* 佣金率標籤 */}
        {commPct > 0 && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {commPct}%
          </div>
        )}
      </div>

      {/* 資訊 */}
      <div className="p-3">
        <h4 className="text-sm font-medium text-gray-800 line-clamp-2 mb-2 leading-snug" title={item.productName}>
          {item.productName}
        </h4>

        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold text-red-600">
            ${price > 0 ? Math.round(price).toLocaleString() : '—'}
          </span>
          {item.priceDiscountRate && (
            <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
              省 {item.priceDiscountRate}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500 mb-3">
          <div>💰 佣金 {commPct}%</div>
          <div>📦 銷量 {sales.toLocaleString()}</div>
          {rating > 0 && <div>⭐ {rating}</div>}
          {item.shopName && (
            <div className="truncate" title={item.shopName}>🏪 {item.shopName}</div>
          )}
        </div>

        {/* ShopBadge */}
        {item.shopType && (
          <div className="mb-3">
            <ShopBadge shopType={item.shopType} />
          </div>
        )}

        {/* 操作按鈕 */}
        <div className="flex gap-2">
          <a
            href={item.offerLink || item.productLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 text-center text-xs font-medium py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95 transition-all"
          >
            🔗 蝦皮
          </a>
          <button
            onClick={() => onImport(item)}
            disabled={importing}
            className="flex-1 text-xs font-medium py-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 active:scale-95 transition-all disabled:opacity-50"
          >
            📥 匯入
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState('hot');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [stats, setStats] = useState({ before: 0, after: 0 });
  const [pageInfo, setPageInfo] = useState({});
  const [currentPage, setCurrentPage] = useState(1);
  const [importingId, setImportingId] = useState(null);
  const [importMsg, setImportMsg] = useState(null);

  // 篩選表單狀態
  const [filters, setFilters] = useState({
    keyword: '',
    sort_type: 2,
    list_type: 0,
    is_ams_offer: null,
    is_key_seller: null,
    limit: 50,
    min_commission_rate: '',
    min_sales: '',
    max_sales: '',
    min_price: '',
    max_price: '',
    min_rating: '',
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const buildParams = useCallback((page = 1) => {
    const tab = TABS.find(t => t.key === activeTab);
    const base = activeTab === 'custom' ? {} : { ...tab.params };
    const params = { ...base, page };

    // 覆蓋：keyword、is_key_seller、is_ams_offer 在所有 Tab 都可用
    if (filters.keyword) params.keyword = filters.keyword;
    if (filters.is_key_seller !== null) params.is_key_seller = filters.is_key_seller;
    if (filters.is_ams_offer !== null) params.is_ams_offer = filters.is_ams_offer;

    // 自定義模式下使用完整篩選
    if (activeTab === 'custom') {
      params.sort_type = filters.sort_type;
      params.list_type = filters.list_type;
      params.limit = filters.limit;
      if (filters.min_commission_rate !== '') params.min_commission_rate = filters.min_commission_rate;
      if (filters.min_sales !== '') params.min_sales = filters.min_sales;
      if (filters.max_sales !== '') params.max_sales = filters.max_sales;
      if (filters.min_price !== '') params.min_price = filters.min_price;
      if (filters.max_price !== '') params.max_price = filters.max_price;
      if (filters.min_rating !== '') params.min_rating = filters.min_rating;
    }

    return params;
  }, [activeTab, filters]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setCurrentPage(1);
    try {
      const data = await exploreProducts(buildParams(1));
      setItems(data.items || []);
      setStats({ before: data.total_before_filter, after: data.total_after_filter });
      setPageInfo(data.page_info || {});
      setSearched(true);
    } catch (err) {
      console.error('探索失敗:', err);
    } finally {
      setLoading(false);
    }
  }, [buildParams]);

  const handleLoadMore = useCallback(async () => {
    const nextPage = currentPage + 1;
    setLoadingMore(true);
    try {
      const data = await exploreProducts(buildParams(nextPage));
      setItems(prev => [...prev, ...(data.items || [])]);
      setStats(prev => ({
        before: prev.before + data.total_before_filter,
        after: prev.after + data.total_after_filter,
      }));
      setPageInfo(data.page_info || {});
      setCurrentPage(nextPage);
    } catch (err) {
      console.error('載入更多失敗:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [currentPage, buildParams]);

  const handleImport = useCallback(async (item) => {
    const url = item.offerLink || item.productLink;
    if (!url) return;
    setImportingId(item.itemId);
    setImportMsg(null);
    try {
      await importAffiliateUrls([url]);
      setImportMsg({ type: 'success', text: `已匯入「${item.productName?.slice(0, 20)}...」` });
    } catch (err) {
      setImportMsg({ type: 'error', text: '匯入失敗: ' + (err.response?.data?.detail || err.message) });
    } finally {
      setImportingId(null);
      setTimeout(() => setImportMsg(null), 3000);
    }
  }, []);

  // 非自定義 Tab 自動載入推薦結果
  const autoLoadRef = useRef(false);
  useEffect(() => {
    if (activeTab !== 'custom') {
      autoLoadRef.current = true;
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const handleTabChange = (tabKey) => {
    setActiveTab(tabKey);
    setItems([]);
    setSearched(false);
    setShowAdvanced(tabKey === 'custom');
  };

  const updateFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const isCustom = activeTab === 'custom';
  const currentTab = TABS.find(t => t.key === activeTab);

  return (
    <div className="p-8 max-w-7xl">
      {/* 標題列 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">🔍 商品探索</h2>
          {searched && (
            <p className="text-sm text-gray-500 mt-1">
              API 回傳 {stats.before} 筆，過濾後 {stats.after} 筆
            </p>
          )}
        </div>
      </div>

      {/* Tab 列 */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-all active:scale-95 ${
              activeTab === tab.key
                ? 'bg-white text-gray-800 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab 描述 */}
      <p className="text-sm text-gray-400 mb-4">{currentTab.desc}</p>

      {/* 篩選面板 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        {/* 基本篩選（所有 Tab 都有） */}
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-xs text-gray-500 mb-1">關鍵字</label>
            <input
              type="text"
              value={filters.keyword}
              onChange={e => updateFilter('keyword', e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="搜尋商品名稱..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.is_key_seller === true}
              onChange={e => updateFilter('is_key_seller', e.target.checked ? true : null)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            重點賣家
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={filters.is_ams_offer === true}
              onChange={e => updateFilter('is_ams_offer', e.target.checked ? true : null)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            賣家加碼
          </label>
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-5 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? '搜尋中...' : '🔍 搜尋'}
          </button>
        </div>

        {/* 進階篩選（Tab 4 展開 or 按鈕展開） */}
        {!isCustom && (
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs text-blue-500 hover:text-blue-600 active:scale-95 transition-all"
          >
            {showAdvanced ? '▲ 收起進階篩選' : '▼ 更多篩選'}
          </button>
        )}

        {(isCustom || showAdvanced) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-100">
            <div>
              <label className="block text-xs text-gray-500 mb-1">排序方式</label>
              <select
                value={filters.sort_type}
                onChange={e => updateFilter('sort_type', parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">列表類型</label>
              <select
                value={filters.list_type}
                onChange={e => updateFilter('list_type', parseInt(e.target.value))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LIST_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">最低佣金率 (%)</label>
              <input
                type="number"
                value={filters.min_commission_rate}
                onChange={e => updateFilter('min_commission_rate', e.target.value)}
                placeholder="例: 5"
                min="0"
                max="100"
                step="0.5"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">最低評分</label>
              <input
                type="number"
                value={filters.min_rating}
                onChange={e => updateFilter('min_rating', e.target.value)}
                placeholder="例: 4"
                min="0"
                max="5"
                step="0.5"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">最低銷量</label>
              <input
                type="number"
                value={filters.min_sales}
                onChange={e => updateFilter('min_sales', e.target.value)}
                placeholder="例: 10"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">最高銷量</label>
              <input
                type="number"
                value={filters.max_sales}
                onChange={e => updateFilter('max_sales', e.target.value)}
                placeholder="例: 5000"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">最低價格</label>
              <input
                type="number"
                value={filters.min_price}
                onChange={e => updateFilter('min_price', e.target.value)}
                placeholder="NT$"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">最高價格</label>
              <input
                type="number"
                value={filters.max_price}
                onChange={e => updateFilter('max_price', e.target.value)}
                placeholder="NT$"
                min="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* 匯入提示 */}
      {importMsg && (
        <div className={`mb-4 px-4 py-2 rounded-lg text-sm ${
          importMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
        }`}>
          {importMsg.text}
        </div>
      )}

      {/* 結果 */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-gray-400">搜尋中...</div>
        </div>
      ) : !searched ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">🔍</div>
          <p>點擊「搜尋」開始探索蝦皮商品</p>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📭</div>
          <p>沒有符合條件的商品</p>
          <p className="text-sm mt-1">試試調整篩選條件</p>
        </div>
      ) : (
        <>
          {/* 商品卡片網格 */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((item, idx) => (
              <ProductCard
                key={`${item.itemId}-${idx}`}
                item={item}
                onImport={handleImport}
                importing={importingId === item.itemId}
              />
            ))}
          </div>

          {/* 載入更多 */}
          {pageInfo.hasNextPage && (
            <div className="flex justify-center mt-8">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 active:scale-95 transition-all disabled:opacity-50"
              >
                {loadingMore ? '載入中...' : `📦 載入更多（已顯示 ${items.length} 筆）`}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
