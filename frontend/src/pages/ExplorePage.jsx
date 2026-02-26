import { useState, useCallback, useEffect, useRef } from 'react';
import { exploreProducts, findCompetitors } from '../api/client';

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

function parseNum(val) {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function ProductCard({ item, onFindCompetitors }) {
  const price = parseNum(item._price || item.priceMin);
  const commRate = parseNum(item._commissionRate || item.commissionRate);
  const commPct = item._commissionPct || round2(commRate * 100);
  const sales = parseNum(item._sales || item.sales);
  const rating = parseNum(item._rating || item.ratingStar);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
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
        {commPct > 0 && (
          <div className="absolute top-2 right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
            {commPct}%
          </div>
        )}
      </div>

      {/* 資訊 */}
      <div className="p-3 flex flex-col flex-1">
        <h4 className="text-sm font-medium text-gray-800 line-clamp-2 mb-2 leading-snug min-h-[2.5rem]" title={item.productName}>
          {item.productName}
        </h4>

        <div className="flex items-baseline justify-between mb-2">
          <span className="text-lg font-bold text-red-600">
            ${price > 0 ? Math.round(price).toLocaleString() : '—'}
          </span>
          {item.priceDiscountRate && (
            <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded ml-1 shrink-0">
              省 {item.priceDiscountRate}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-gray-500 mb-2">
          <div>💰 佣金 {commPct}%</div>
          <div>📦 銷量 {sales.toLocaleString()}</div>
          {rating > 0 && <div>⭐ {rating.toFixed ? rating.toFixed(1) : rating}</div>}
          {item.shopName && (
            <div className="truncate" title={item.shopName}>🏪 {item.shopName}</div>
          )}
        </div>

        {/* ShopBadge + 按鈕推到底部 */}
        <div className="mt-auto">
          {item.shopType && (
            <div className="mb-2">
              <ShopBadge shopType={item.shopType} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={item.offerLink || item.productLink}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs font-medium py-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-95 transition-all"
            >
              🔗 蝦皮
            </a>
            <button
              onClick={() => onFindCompetitors(item)}
              className="text-center text-xs font-medium py-1.5 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 active:scale-95 transition-all"
            >
              🔍 找競品
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CompetitorRow({ item, rank, sourcePrice }) {
  const price = parseNum(item._price || item.priceMin);
  const commPct = item._commissionPct || round2(parseNum(item._commissionRate || item.commissionRate) * 100);
  const sales = parseNum(item._sales || item.sales);
  const rating = parseNum(item._rating || item.ratingStar);
  const score = item._competitorScore || 0;

  // 價格差異百分比
  let priceDiff = null;
  if (sourcePrice && sourcePrice > 0 && price > 0) {
    priceDiff = Math.round(((price - sourcePrice) / sourcePrice) * 100);
  }

  // 分數顏色
  const scoreColor = score >= 70 ? 'bg-green-100 text-green-700' :
    score >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600';

  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-gray-50 border-b border-gray-100 last:border-b-0">
      {/* 排名 */}
      <div className="w-7 text-center font-bold text-gray-400 text-sm shrink-0">
        {rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : `#${rank}`}
      </div>

      {/* 圖片 */}
      <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.target.style.display = 'none'; }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-lg text-gray-300">📦</div>
        )}
      </div>

      {/* 名稱 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate" title={item.productName}>
          {item.productName}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {item.shopName && <span className="text-xs text-gray-400 truncate max-w-[120px]">{item.shopName}</span>}
          {item.shopType && <ShopBadge shopType={item.shopType} />}
        </div>
      </div>

      {/* 價格 */}
      <div className="text-right shrink-0 w-24">
        <div className="text-sm font-bold text-red-600">
          ${price > 0 ? Math.round(price).toLocaleString() : '—'}
        </div>
        {priceDiff !== null && (
          <div className={`text-xs ${priceDiff > 0 ? 'text-red-400' : priceDiff < 0 ? 'text-green-500' : 'text-gray-400'}`}>
            {priceDiff > 0 ? '+' : ''}{priceDiff}%
          </div>
        )}
      </div>

      {/* 佣金率 */}
      <div className="text-center shrink-0 w-16">
        <div className="text-xs text-gray-500">佣金</div>
        <div className="text-sm font-medium text-amber-600">{commPct}%</div>
      </div>

      {/* 銷量 */}
      <div className="text-center shrink-0 w-16">
        <div className="text-xs text-gray-500">銷量</div>
        <div className="text-sm font-medium text-gray-700">{sales.toLocaleString()}</div>
      </div>

      {/* 評分 */}
      <div className="text-center shrink-0 w-14">
        <div className="text-xs text-gray-500">評分</div>
        <div className="text-sm font-medium text-gray-700">{rating > 0 ? rating.toFixed(1) : '—'}</div>
      </div>

      {/* 分數 */}
      <div className={`shrink-0 px-2 py-1 rounded-full text-xs font-bold ${scoreColor}`}>
        {score}
      </div>

      {/* 連結 */}
      <a
        href={item.offerLink || item.productLink}
        target="_blank"
        rel="noopener noreferrer"
        className="shrink-0 text-blue-500 hover:text-blue-600 active:scale-95 transition-all text-sm"
        title="前往蝦皮"
      >
        🔗
      </a>
    </div>
  );
}

function CompetitorModal({ isOpen, onClose, sourceItem, data, loading }) {
  if (!isOpen) return null;

  const sourcePrice = sourceItem ? parseNum(sourceItem._price || sourceItem.priceMin) : 0;
  const sourceComm = sourceItem ? (sourceItem._commissionPct || round2(parseNum(sourceItem._commissionRate || sourceItem.commissionRate) * 100)) : 0;
  const sourceSales = sourceItem ? parseNum(sourceItem._sales || sourceItem.sales) : 0;
  const sourceRating = sourceItem ? parseNum(sourceItem._rating || sourceItem.ratingStar) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-[95vw] max-w-4xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="p-5 border-b border-gray-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-gray-800">🔍 競品分析</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 active:scale-95 transition-all text-xl leading-none">✕</button>
          </div>

          {sourceItem && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-sm font-medium text-blue-800 truncate mb-1" title={sourceItem.productName}>
                📌 {sourceItem.productName}
              </div>
              <div className="flex items-center gap-4 text-xs text-blue-600">
                <span>${sourcePrice > 0 ? Math.round(sourcePrice).toLocaleString() : '—'}</span>
                <span>💰 {sourceComm}%</span>
                <span>📦 {sourceSales.toLocaleString()}</span>
                {sourceRating > 0 && <span>⭐ {sourceRating.toFixed(1)}</span>}
              </div>
            </div>
          )}

          {/* 關鍵字標籤 */}
          {data?.keywords && data.keywords.length > 0 && (
            <div className="flex items-center gap-2 mt-3">
              <span className="text-xs text-gray-500">搜尋關鍵字：</span>
              {data.keywords.map((kw, i) => (
                <span key={i} className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{kw}</span>
              ))}
              {data.total_candidates > 0 && (
                <span className="text-xs text-gray-400 ml-auto">共找到 {data.total_candidates} 個候選，顯示 Top {data.items?.length || 0}</span>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="text-4xl mb-3 animate-pulse">🔍</div>
              <p className="text-sm">正在搜尋競品...</p>
              <p className="text-xs mt-1 text-gray-300">LLM 提取關鍵字 + 蝦皮 API 查詢</p>
            </div>
          ) : !data?.items || data.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="text-4xl mb-3">📭</div>
              <p className="text-sm">沒有找到競品</p>
              <p className="text-xs mt-1">可能是商品類別較特殊</p>
            </div>
          ) : (
            <div>
              {data.items.map((item, idx) => (
                <CompetitorRow
                  key={item.itemId || idx}
                  item={item}
                  rank={idx + 1}
                  sourcePrice={sourcePrice}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function round2(n) { return Math.round(n * 100) / 100; }

export default function ExplorePage() {
  const [activeTab, setActiveTab] = useState('hot');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searched, setSearched] = useState(false);
  const [stats, setStats] = useState({ before: 0, after: 0 });
  const [pageInfo, setPageInfo] = useState({});
  const [currentPage, setCurrentPage] = useState(1);

  // 競品 Modal 狀態
  const [competitorModal, setCompetitorModal] = useState({
    open: false, sourceItem: null, data: null, loading: false,
  });

  const handleFindCompetitors = useCallback(async (item) => {
    const price = parseNum(item._price || item.priceMin);
    setCompetitorModal({ open: true, sourceItem: item, data: null, loading: true });
    try {
      const data = await findCompetitors(item.productName, price > 0 ? price : undefined);
      setCompetitorModal(prev => ({ ...prev, data, loading: false }));
    } catch (err) {
      console.error('競品搜尋失敗:', err);
      setCompetitorModal(prev => ({ ...prev, data: { items: [], keywords: [], total_candidates: 0 }, loading: false }));
    }
  }, []);

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

    // 自定義模式：完整篩選；其他 Tab：進階篩選作為覆蓋值
    if (activeTab === 'custom') {
      params.sort_type = filters.sort_type;
      params.list_type = filters.list_type;
      params.limit = filters.limit;
    }
    // 數值篩選在所有 Tab 都生效（用戶輸入值覆蓋 Tab 預設值）
    if (filters.min_commission_rate !== '') params.min_commission_rate = filters.min_commission_rate;
    if (filters.min_sales !== '') params.min_sales = filters.min_sales;
    if (filters.max_sales !== '') params.max_sales = filters.max_sales;
    if (filters.min_price !== '') params.min_price = filters.min_price;
    if (filters.max_price !== '') params.max_price = filters.max_price;
    if (filters.min_rating !== '') params.min_rating = filters.min_rating;

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
                onFindCompetitors={handleFindCompetitors}
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

      {/* 競品分析 Modal */}
      <CompetitorModal
        isOpen={competitorModal.open}
        onClose={() => setCompetitorModal({ open: false, sourceItem: null, data: null, loading: false })}
        sourceItem={competitorModal.sourceItem}
        data={competitorModal.data}
        loading={competitorModal.loading}
      />
    </div>
  );
}
