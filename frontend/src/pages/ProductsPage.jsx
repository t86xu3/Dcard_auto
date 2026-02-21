import { useState, useEffect } from 'react';
import { getProducts, deleteProduct, batchDeleteProducts, downloadProductImages, generateArticle, getPrompts, updateProduct, invalidateCache, importAffiliateUrls } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableProductCard({ id, product, index, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 'auto',
    opacity: isDragging ? 0.8 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative flex flex-col items-center gap-1 px-3 py-2 bg-white border rounded-xl shadow-sm cursor-grab select-none shrink-0 ${
        isDragging ? 'border-blue-400 shadow-md' : 'border-gray-200 hover:border-gray-300'
      }`}
      {...attributes}
      {...listeners}
    >
      {/* 序號標籤 */}
      <span className="absolute -top-2 -left-2 w-5 h-5 bg-blue-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
        {index + 1}
      </span>
      {/* 取消按鈕 */}
      <button
        className="absolute -top-2 -right-2 w-5 h-5 bg-red-400 hover:bg-red-500 text-white text-xs rounded-full flex items-center justify-center active:scale-95 transition-transform"
        onClick={(e) => { e.stopPropagation(); onRemove(id); }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        ✕
      </button>
      {/* 商品圖片 */}
      {product?.images?.[0] ? (
        <img src={product.images[0]} alt="" className="w-12 h-12 rounded-lg object-cover bg-gray-100" />
      ) : (
        <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 text-lg">📦</div>
      )}
      {/* 商品名稱截斷 */}
      <span className="text-xs text-gray-600 text-center truncate w-20" title={product?.name}>
        {product?.name?.slice(0, 8) || '未知商品'}
      </span>
    </div>
  );
}

export default function ProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]); // Array<number> 有序陣列
  const [loading, setLoading] = useState(true);
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }
  const [includeImages, setIncludeImages] = useState(false);
  const [editingUrlId, setEditingUrlId] = useState(null);
  const [editingUrlValue, setEditingUrlValue] = useState('');
  const [showAffiliateModal, setShowAffiliateModal] = useState(false);
  const [affiliateUrls, setAffiliateUrls] = useState('');
  const [affiliateImporting, setAffiliateImporting] = useState(false);
  const [affiliateResult, setAffiliateResult] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const loadProducts = async () => {
    try {
      const data = await getProducts();
      setProducts(data);
    } catch (err) {
      console.error('載入商品失敗:', err);
    }
    setLoading(false);
  };

  const loadPrompts = async () => {
    try {
      const data = await getPrompts();
      setPromptTemplates(data);
      const defaultOne = data.find(t => t.is_default);
      if (defaultOne) setSelectedPromptId(defaultOne.id);
    } catch (err) {
      console.error('載入範本失敗:', err);
    }
  };

  useEffect(() => { Promise.all([loadProducts(), loadPrompts()]); }, []);

  const toggleSelect = (id) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const selectableProducts = products.filter(p => p.name !== '待擷取');

  const selectAll = () => {
    if (selected.length === selectableProducts.length) {
      setSelected([]);
    } else {
      setSelected(selectableProducts.map(p => p.id));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('確定刪除此商品？')) return;
    await deleteProduct(id);
    invalidateCache('products');
    await loadProducts();
    setSelected(prev => prev.filter(x => x !== id));
  };

  const handleBatchDelete = async () => {
    if (selected.length === 0) return;
    if (!confirm(`確定刪除 ${selected.length} 個商品？`)) return;
    await batchDeleteProducts(selected);
    invalidateCache('products');
    setSelected([]);
    await loadProducts();
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleGenerate = async () => {
    if (selected.length < 1) return;
    setGenerating(true);
    try {
      const type = selected.length >= 2 ? 'comparison' : 'review';
      const payload = {
        product_ids: selected, // 直接用有序陣列
        article_type: type,
        target_forum: 'goodthings',
        model: localStorage.getItem('llmModel') || 'gemini-2.5-flash',
      };
      if (selectedPromptId) {
        payload.prompt_template_id = selectedPromptId;
      }
      if (includeImages) {
        payload.include_images = true;
        payload.image_sources = ['description'];
      }
      await generateArticle(payload);
      showToast('success', '文章生成中，可到文章管理頁查看進度');
    } catch (err) {
      showToast('error', '生成失敗: ' + (err.response?.data?.detail || err.message));
    }
    setGenerating(false);
  };

  const handleDownloadImages = async (id) => {
    try {
      const result = await downloadProductImages(id);
      alert(`下載完成: ${result.downloaded}/${result.total} 張圖片`);
    } catch (err) {
      alert('下載失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const startEditUrl = (product) => {
    setEditingUrlId(product.id);
    setEditingUrlValue(product.product_url || '');
  };

  const cancelEditUrl = () => {
    setEditingUrlId(null);
    setEditingUrlValue('');
  };

  const handleSaveUrl = async (productId) => {
    try {
      const updated = await updateProduct(productId, { product_url: editingUrlValue.trim() || null });
      setProducts(prev => prev.map(p => p.id === productId ? { ...p, product_url: updated.product_url } : p));
      showToast('success', '連結已更新');
    } catch (err) {
      showToast('error', '更新失敗: ' + (err.response?.data?.detail || err.message));
    }
    setEditingUrlId(null);
    setEditingUrlValue('');
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setSelected(prev => {
      const oldIndex = prev.indexOf(active.id);
      const newIndex = prev.indexOf(over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  };

  const handleRemoveFromSelected = (id) => {
    setSelected(prev => prev.filter(x => x !== id));
  };

  const handleAffiliateImport = async () => {
    const urls = affiliateUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return;

    setAffiliateImporting(true);
    setAffiliateResult(null);
    try {
      const data = await importAffiliateUrls(urls);
      setAffiliateResult(data);
      invalidateCache('products');
      await loadProducts();
    } catch (err) {
      showToast('error', `匯入失敗: ${err.response?.data?.detail || err.message}`);
    } finally {
      setAffiliateImporting(false);
    }
  };

  // 建立 id → product 的查找表
  const productsMap = {};
  for (const p of products) {
    productsMap[p.id] = p;
  }

  return (
    <div className="p-8 relative">
      {/* Toast 通知 */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-800">商品管理</h2>
        <div className="flex gap-3">
          <button
            onClick={() => { invalidateCache('products'); loadProducts(); }}
            className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 active:scale-95 transition-transform"
            title="重新整理"
          >
            🔄 重新整理
          </button>
          <button
            onClick={() => { setShowAffiliateModal(true); setAffiliateResult(null); setAffiliateUrls(''); }}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 active:scale-95 transition-transform"
          >
            🔗 匯入聯盟行銷網址
          </button>
          {selected.length > 0 && (
            <>
              {promptTemplates.length > 0 && (
                <select
                  value={selectedPromptId || ''}
                  onChange={(e) => setSelectedPromptId(e.target.value ? Number(e.target.value) : null)}
                  className="px-3 py-2 border border-gray-200 rounded-lg text-sm"
                >
                  {promptTemplates.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}{t.is_default ? ' (預設)' : ''}
                    </option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-1.5 px-3 py-2 border border-gray-200 rounded-lg text-sm cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={includeImages}
                  onChange={(e) => setIncludeImages(e.target.checked)}
                  className="rounded"
                />
                <span>🖼️ 附描述圖給 LLM</span>
              </label>
              <button
                onClick={handleGenerate}
                disabled={generating || !user?.is_approved}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium active:scale-95 transition-transform ${
                  !user?.is_approved ? 'bg-gray-400 cursor-not-allowed' :
                  generating ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
                }`}
                title={!user?.is_approved ? '等待管理員核准' : ''}
              >
                {!user?.is_approved ? '🔒 等待管理員核准' : generating ? '生成中...' : `✨ 生成${selected.length >= 2 ? '比較文' : '開箱文'} (${selected.length})`}
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 active:scale-95 transition-transform"
              >
                🗑️ 刪除 ({selected.length})
              </button>
            </>
          )}
        </div>
      </div>

      {/* 已選商品排序區域 */}
      {selected.length > 0 && (
        <div className="mb-4 px-4 pb-4 pt-2 bg-blue-50 border border-blue-200 rounded-xl">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-sm font-medium text-blue-700">📋 文章商品順序</span>
            <span className="text-xs text-blue-500">拖拽卡片調整順序，#1 在文章中排最前面</span>
          </div>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={selected} strategy={horizontalListSortingStrategy}>
              <div className="flex gap-4 overflow-x-auto pt-3 pb-2 px-1">
                {selected.map((id, index) => (
                  <SortableProductCard
                    key={id}
                    id={id}
                    product={productsMap[id]}
                    index={index}
                    onRemove={handleRemoveFromSelected}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      )}

      {loading ? (
        <div className="text-center py-20 text-gray-400">載入中...</div>
      ) : products.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <div className="text-5xl mb-4">📦</div>
          <p>尚無商品資料</p>
          <p className="text-sm mt-2">請使用 Chrome Extension 擷取蝦皮商品</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-left">
              <tr>
                <th className="p-3 w-10">
                  <input
                    type="checkbox"
                    checked={selected.length === selectableProducts.length && selectableProducts.length > 0}
                    onChange={selectAll}
                    className="rounded"
                  />
                </th>
                <th className="p-3">商品</th>
                <th className="p-3 w-24">價格</th>
                <th className="p-3 w-20">評分</th>
                <th className="p-3 w-20">銷量</th>
                <th className="p-3 w-32">操作</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => {
                const isPlaceholder = product.name === '待擷取';
                return (
                <tr key={product.id} className={`border-t border-gray-100 ${isPlaceholder ? 'bg-amber-50 hover:bg-amber-100' : 'hover:bg-gray-50'}`}>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      disabled={isPlaceholder}
                      className={`rounded ${isPlaceholder ? 'opacity-30 cursor-not-allowed' : ''}`}
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {isPlaceholder ? (
                        <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center text-2xl">📦</div>
                      ) : product.images?.[0] ? (
                        <img
                          src={product.images[0]}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover bg-gray-100"
                        />
                      ) : null}
                      <div className="min-w-0">
                        <div className={`font-medium truncate max-w-xs ${isPlaceholder ? 'text-amber-700' : 'text-gray-800'}`}>
                          {isPlaceholder ? '⏳ 待擷取' : product.name}
                        </div>
                        {isPlaceholder ? (
                          product.affiliate_url && (
                            <div className="text-xs text-amber-600 truncate max-w-[200px]" title={product.affiliate_url}>
                              🔗 {product.affiliate_url}
                            </div>
                          )
                        ) : (
                          <>
                            <div className="text-xs text-gray-400">{product.shop_name}</div>
                            {editingUrlId === product.id ? (
                              <div className="flex items-center gap-1.5 mt-1">
                                <input
                                  type="text"
                                  value={editingUrlValue}
                                  onChange={(e) => setEditingUrlValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveUrl(product.id);
                                    if (e.key === 'Escape') cancelEditUrl();
                                  }}
                                  placeholder="https://shopee.tw/..."
                                  className="flex-1 text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:border-blue-400 min-w-0"
                                  autoFocus
                                />
                                <button
                                  onClick={() => handleSaveUrl(product.id)}
                                  className="text-xs text-green-600 hover:text-green-700 whitespace-nowrap active:scale-95 transition-transform inline-block"
                                >
                                  💾 儲存
                                </button>
                                <button
                                  onClick={cancelEditUrl}
                                  className="text-xs text-gray-400 hover:text-gray-600 whitespace-nowrap active:scale-95 transition-transform inline-block"
                                >
                                  ✕ 取消
                                </button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1 mt-0.5">
                                {product.affiliate_url ? (
                                  <a
                                    href={product.affiliate_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-green-600 hover:text-green-700 truncate max-w-[200px]"
                                    title={product.affiliate_url}
                                  >
                                    🔗 {product.affiliate_url.replace(/^https?:\/\//, '').slice(0, 30)}
                                  </a>
                                ) : product.product_url ? (
                                  <a
                                    href={product.product_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-400 hover:text-blue-600 truncate max-w-[200px]"
                                    title={product.product_url}
                                  >
                                    {product.product_url.replace(/^https?:\/\//, '').slice(0, 35)}...
                                  </a>
                                ) : null}
                                <button
                                  onClick={() => startEditUrl(product)}
                                  className="text-xs text-gray-400 hover:text-gray-600 active:scale-95 transition-transform inline-block"
                                  title="編輯連結"
                                >
                                  ✏️
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="p-3 font-medium text-blue-600">
                    {isPlaceholder ? <span className="text-gray-400">-</span> : `$${product.price?.toLocaleString() || 'N/A'}`}
                  </td>
                  <td className="p-3 text-yellow-500">
                    {isPlaceholder ? <span className="text-gray-400">-</span> : product.rating ? `⭐ ${product.rating.toFixed(1)}` : '-'}
                  </td>
                  <td className="p-3 text-gray-600">
                    {isPlaceholder ? <span className="text-gray-400">-</span> : product.sold?.toLocaleString() || '-'}
                  </td>
                  <td className="p-3">
                    {isPlaceholder ? (
                      <button
                        onClick={() => window.open(product.product_url, '_blank')}
                        className="text-xs text-amber-600 hover:text-amber-800 font-medium active:scale-95 transition-transform inline-block"
                      >
                        🔗 前往擷取
                      </button>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDownloadImages(product.id)}
                          className="text-xs text-blue-500 hover:underline active:scale-95 transition-transform inline-block"
                          title="下載圖片"
                        >
                          📥 圖片
                        </button>
                        <button
                          onClick={() => handleDelete(product.id)}
                          className="text-xs text-red-500 hover:underline active:scale-95 transition-transform inline-block"
                        >
                          🗑️ 刪除
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Affiliate URL Import Modal */}
      {showAffiliateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg font-bold">🔗 匯入聯盟行銷網址</h2>
                <button
                  onClick={() => setShowAffiliateModal(false)}
                  className="text-gray-500 hover:text-gray-700 text-2xl active:scale-95 transition-transform"
                >
                  ×
                </button>
              </div>

              <p className="text-sm text-gray-600 mb-3">
                每行貼入一個蝦皮聯盟行銷短網址（如 https://s.shopee.tw/xxxxx）。
                <span className="block text-xs text-gray-400 mt-1">
                  先貼網址再用 Extension 擷取，或先擷取商品再貼網址綁定，兩種順序皆可。
                </span>
              </p>

              <textarea
                value={affiliateUrls}
                onChange={(e) => setAffiliateUrls(e.target.value)}
                placeholder={"https://s.shopee.tw/xxxxx\nhttps://s.shopee.tw/yyyyy"}
                rows={6}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono resize-y focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                disabled={affiliateImporting}
              />

              {affiliateResult && (
                <div className="mt-3 p-3 bg-gray-50 rounded-lg text-sm space-y-1">
                  {affiliateResult.imported.length > 0 && (
                    <div className="text-green-700">✅ 新建待擷取 {affiliateResult.imported.length} 筆</div>
                  )}
                  {affiliateResult.skipped.length > 0 && (
                    <div className="text-blue-700">
                      🔗 已綁定聯盟網址 {affiliateResult.skipped.length} 筆
                      {affiliateResult.skipped.map((s, i) => (
                        <div key={i} className="text-xs text-blue-500 ml-4 truncate">
                          {s.product_name ? `→ ${s.product_name}` : `→ item ${s.item_id}`}
                        </div>
                      ))}
                    </div>
                  )}
                  {affiliateResult.failed.length > 0 && (
                    <div className="text-red-700">
                      ❌ 失敗 {affiliateResult.failed.length} 筆
                      {affiliateResult.failed.map((f, i) => (
                        <div key={i} className="text-xs text-red-500 ml-4 truncate">{f.url}: {f.message}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-4">
                <button
                  onClick={() => setShowAffiliateModal(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 active:scale-95 transition-transform"
                >
                  {affiliateResult ? '關閉' : '取消'}
                </button>
                {!affiliateResult && (
                  <button
                    onClick={handleAffiliateImport}
                    disabled={affiliateImporting || !affiliateUrls.trim()}
                    className={`px-4 py-2 rounded-lg text-white active:scale-95 transition-transform ${
                      affiliateImporting || !affiliateUrls.trim()
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-amber-500 hover:bg-amber-600'
                    }`}
                  >
                    {affiliateImporting ? '匯入中...' : '📥 匯入'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
