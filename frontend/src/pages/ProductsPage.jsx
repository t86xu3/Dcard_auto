import { useState, useEffect } from 'react';
import { getProducts, deleteProduct, batchDeleteProducts, downloadProductImages, generateArticle, getPrompts } from '../api/client';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [promptTemplates, setPromptTemplates] = useState([]);
  const [selectedPromptId, setSelectedPromptId] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState(null); // { type: 'success'|'error', message }

  const loadProducts = async () => {
    setLoading(true);
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

  useEffect(() => { loadProducts(); loadPrompts(); }, []);

  const toggleSelect = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === products.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.id)));
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('確定刪除此商品？')) return;
    await deleteProduct(id);
    await loadProducts();
    selected.delete(id);
    setSelected(new Set(selected));
  };

  const handleBatchDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`確定刪除 ${selected.size} 個商品？`)) return;
    await batchDeleteProducts([...selected]);
    setSelected(new Set());
    await loadProducts();
  };

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleGenerate = async () => {
    if (selected.size < 1) return;
    setGenerating(true);
    try {
      const type = selected.size >= 2 ? 'comparison' : 'review';
      const payload = {
        product_ids: [...selected],
        article_type: type,
        target_forum: 'goodthings',
      };
      if (selectedPromptId) {
        payload.prompt_template_id = selectedPromptId;
      }
      await generateArticle(payload);
      showToast('success', '文章已生成！請到文章管理頁面查看。');
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

  return (
    <div className="p-8 relative">
      {/* 生成中 Overlay */}
      {generating && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-xl flex flex-col items-center gap-4">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <div className="text-lg font-semibold text-gray-800">文章生成中...</div>
            <div className="text-sm text-gray-400">LLM 正在撰寫文章，請稍候</div>
          </div>
        </div>
      )}

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
          {selected.size > 0 && (
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
              <button
                onClick={handleGenerate}
                disabled={generating}
                className={`px-4 py-2 text-white rounded-lg text-sm font-medium ${
                  generating ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {generating ? '生成中...' : `✨ 生成${selected.size >= 2 ? '比較文' : '開箱文'} (${selected.size})`}
              </button>
              <button
                onClick={handleBatchDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
              >
                🗑️ 刪除 ({selected.size})
              </button>
            </>
          )}
        </div>
      </div>

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
                    checked={selected.size === products.length && products.length > 0}
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
              {products.map(product => (
                <tr key={product.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selected.has(product.id)}
                      onChange={() => toggleSelect(product.id)}
                      className="rounded"
                    />
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {product.images?.[0] && (
                        <img
                          src={product.images[0]}
                          alt=""
                          className="w-12 h-12 rounded-lg object-cover bg-gray-100"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-800 truncate max-w-xs">
                          {product.name}
                        </div>
                        <div className="text-xs text-gray-400">{product.shop_name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="p-3 font-medium text-blue-600">
                    ${product.price?.toLocaleString() || 'N/A'}
                  </td>
                  <td className="p-3 text-yellow-500">
                    {product.rating ? `⭐ ${product.rating.toFixed(1)}` : '-'}
                  </td>
                  <td className="p-3 text-gray-600">
                    {product.sold?.toLocaleString() || '-'}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleDownloadImages(product.id)}
                        className="text-xs text-blue-500 hover:underline"
                        title="下載圖片"
                      >
                        📥 圖片
                      </button>
                      <button
                        onClick={() => handleDelete(product.id)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
