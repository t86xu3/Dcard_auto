import { useState, useEffect, useRef, useCallback } from 'react';
import { getArticles, getArticle, updateArticle, deleteArticle, batchDeleteArticles, optimizeSeo, copyArticle, analyzeSeo, analyzeSeoById, invalidateCache, fetchArticlesFresh } from '../api/client';
import SeoPanel from '../components/SeoPanel';
import { useAuth } from '../contexts/AuthContext';
import { useExtensionDetect } from '../hooks/useExtensionDetect';

// 複製圖片到剪貼簿（透過後端代理避免跨域）
async function copyImageToClipboard(imageUrl) {
  try {
    const proxyUrl = `/api/articles/image-proxy?url=${encodeURIComponent(imageUrl)}`;
    const resp = await fetch(proxyUrl);
    if (!resp.ok) throw new Error(`代理回應 ${resp.status}`);
    const blob = await resp.blob();
    const pngBlob = await convertToPng(blob);
    await navigator.clipboard.write([
      new ClipboardItem({ 'image/png': pngBlob })
    ]);
    return true;
  } catch (err) {
    console.error('複製圖片失敗:', err);
    alert(`複製圖片失敗: ${err.message}`);
    return false;
  }
}

// 將圖片 blob 轉為 PNG
function convertToPng(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((pngBlob) => {
          URL.revokeObjectURL(url);
          if (pngBlob) resolve(pngBlob);
          else reject(new Error('canvas.toBlob 失敗'));
        }, 'image/png');
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('圖片載入失敗'));
    };
    img.src = url;
  });
}

// 單張圖片元件（含複製按鈕）
function ArticleImage({ src, alt }) {
  const [copying, setCopying] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e) => {
    e.stopPropagation();
    setCopying(true);
    const ok = await copyImageToClipboard(src);
    setCopying(false);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative inline-block my-3 group">
      <img
        src={src}
        alt={alt}
        className="max-w-md rounded-lg border border-gray-200"
        loading="lazy"
      />
      <button
        onClick={handleCopy}
        disabled={copying}
        className={`absolute top-2 right-2 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-md transition-all active:scale-95 ${
          copied
            ? 'bg-green-500 text-white'
            : 'bg-white/90 text-gray-700 hover:bg-blue-500 hover:text-white opacity-0 group-hover:opacity-100'
        }`}
      >
        {copying ? '複製中...' : copied ? '已複製!' : '📋 複製圖片'}
      </button>
    </div>
  );
}

// 將含圖片 markdown 的文字渲染為 React 元素
function RenderContent({ text }) {
  if (!text) return <span className="text-gray-400">（無內容）</span>;

  // 拆分 markdown 圖片語法 ![alt](url) 和一般文字
  const parts = text.split(/(!\[.*?\]\(.*?\))/g);

  return parts.map((part, i) => {
    const imgMatch = part.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (imgMatch) {
      return <ArticleImage key={i} src={imgMatch[2]} alt={imgMatch[1]} />;
    }
    // 一般文字，保留換行
    return <span key={i}>{part}</span>;
  });
}

export default function ArticlesPage() {
  const { user } = useAuth();
  const { isInstalled: extInstalled, extensionId } = useExtensionDetect();
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editingTitle, setEditingTitle] = useState(false);
  const [seoResult, setSeoResult] = useState(null);
  const [seoBeforeAnalysis, setSeoBeforeAnalysis] = useState(null);
  const [seoOptimized, setSeoOptimized] = useState(false);
  const [seoBeforeScore, setSeoBeforeScore] = useState(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [toast, setToast] = useState(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const loadArticles = async () => {
    try {
      const data = await getArticles();
      setArticles(data);
    } catch (err) {
      console.error('載入文章失敗:', err);
    }
    setLoading(false);
  };

  const articlesRef = useRef(articles);
  articlesRef.current = articles;
  const selectedArticleRef = useRef(selectedArticle);
  selectedArticleRef.current = selectedArticle;
  const pollStartRef = useRef(null);

  // 靜默輪詢（不觸發 loading 狀態，跳過快取）
  const pollArticles = useCallback(async () => {
    try {
      const data = await fetchArticlesFresh();
      const prev = articlesRef.current;
      const prevGenerating = prev.filter(a => a.status === 'generating').map(a => a.id);
      const nowCompleted = data.filter(a => prevGenerating.includes(a.id) && a.status !== 'generating');
      nowCompleted.forEach(a => {
        if (a.status === 'draft') {
          showToast('success', `「${a.title}」生成完成！`);
        } else if (a.status === 'failed') {
          showToast('error', `文章生成失敗`);
        }
      });
      setArticles(data);
      const sel = selectedArticleRef.current;
      if (sel) {
        const updated = data.find(a => a.id === sel.id);
        if (updated && updated.status !== sel.status) {
          setSelectedArticle(updated);
          setEditContent(updated.content || '');
          setEditTitle(updated.title || '');
        }
      }
    } catch (err) {
      console.error('輪詢文章失敗:', err);
    }
  }, []);

  useEffect(() => { loadArticles(); }, []);

  // 偵測到 generating 狀態時啟動退避輪詢
  useEffect(() => {
    const hasGenerating = articles.some(a => a.status === 'generating');
    if (!hasGenerating) {
      pollStartRef.current = null;
      return;
    }
    if (!pollStartRef.current) pollStartRef.current = Date.now();

    function getInterval() {
      const elapsed = Date.now() - pollStartRef.current;
      if (elapsed < 30_000) return 3_000;   // 前 30 秒：每 3 秒
      if (elapsed < 60_000) return 10_000;  // 30-60 秒：每 10 秒
      return 20_000;                        // 60 秒後：每 20 秒
    }

    let timer;
    function schedule() {
      timer = setTimeout(async () => {
        await pollArticles();
        schedule();
      }, getInterval());
    }
    schedule();
    return () => clearTimeout(timer);
  }, [articles, pollArticles]);

  const selectArticle = async (id) => {
    try {
      const article = await getArticle(id);
      setSelectedArticle(article);
      setEditContent(article.content || '');
      setEditTitle(article.title || '');
      setEditingTitle(false);
      setSeoBeforeAnalysis(null);
      setSeoOptimized(false);
      setSeoBeforeScore(null);

      // 若已有 seo_suggestions 且含 breakdown，直接顯示
      const seoData = article.seo_suggestions;
      if (seoData && typeof seoData === 'object' && !Array.isArray(seoData) && seoData.breakdown) {
        setSeoResult(seoData);
      } else {
        setSeoResult(null);
      }
    } catch (err) {
      console.error('載入文章詳情失敗:', err);
    }
  };

  const handleSave = async () => {
    if (!selectedArticle) return;
    try {
      const updated = await updateArticle(selectedArticle.id, { content: editContent });
      setSelectedArticle(updated);
      setEditing(false);
      invalidateCache('articles');
      await loadArticles();
    } catch (err) {
      alert('儲存失敗');
    }
  };

  const handleSaveTitle = async () => {
    if (!selectedArticle || !editTitle.trim()) return;
    try {
      const updated = await updateArticle(selectedArticle.id, { title: editTitle });
      setSelectedArticle(updated);
      setEditingTitle(false);
      invalidateCache('articles');
      await loadArticles();
    } catch (err) {
      alert('標題儲存失敗');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('確定刪除此文章？')) return;
    await deleteArticle(id);
    invalidateCache('articles');
    if (selectedArticle?.id === id) setSelectedArticle(null);
    await loadArticles();
  };

  const toggleSelectId = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`確定刪除所選的 ${selectedIds.length} 篇文章？`)) return;
    setBatchDeleting(true);
    try {
      await batchDeleteArticles(selectedIds);
      invalidateCache('articles');
      if (selectedArticle && selectedIds.includes(selectedArticle.id)) setSelectedArticle(null);
      setSelectedIds([]);
      setSelectMode(false);
      await loadArticles();
      showToast('success', `已刪除 ${selectedIds.length} 篇文章`);
    } catch (err) {
      alert('批量刪除失敗');
    }
    setBatchDeleting(false);
  };

  const handleOptimizeSeo = async () => {
    if (!selectedArticle) return;
    setOptimizing(true);
    try {
      const resp = await optimizeSeo(selectedArticle.id, localStorage.getItem('llmModel'));
      setSelectedArticle(resp.article);
      setEditTitle(resp.article.title || '');
      setEditContent(resp.article.content || '');
      // 顯示優化後的完整分析
      setSeoResult(resp.after_analysis || resp.article.seo_suggestions);
      setSeoOptimized(true);
      setSeoBeforeScore(resp.before_score);
      setSeoBeforeAnalysis(resp.before_analysis || null);
      invalidateCache('articles');
      await loadArticles();
    } catch (err) {
      alert('SEO 優化失敗');
    }
    setOptimizing(false);
  };

  const handleAnalyzeSeo = async () => {
    if (!selectedArticle) return;
    setAnalyzing(true);
    try {
      const result = await analyzeSeoById(selectedArticle.id);
      setSeoResult(result);
      setSeoOptimized(false);
      setSeoBeforeScore(null);
      setSeoBeforeAnalysis(null);
    } catch (err) {
      alert('SEO 分析失敗');
    }
    setAnalyzing(false);
  };

  const handleCopy = async () => {
    if (!selectedArticle) return;
    try {
      const data = await copyArticle(selectedArticle.id);
      await navigator.clipboard.writeText(`${data.title}\n\n${data.content}`);
      showToast('success', '已複製到剪貼簿！');
    } catch (err) {
      alert('複製失敗');
    }
  };

  const handlePasteToDcard = async () => {
    if (!selectedArticle || !extensionId) return;
    setPasting(true);
    try {
      chrome.runtime.sendMessage(extensionId, {
        type: 'PASTE_ARTICLE_TO_DCARD',
        data: {
          articleId: selectedArticle.id,
          forum: selectedArticle.target_forum,
          accessToken: localStorage.getItem('accessToken'),
        }
      }, (response) => {
        setPasting(false);
        if (chrome.runtime.lastError) {
          showToast('error', `Extension 連線失敗: ${chrome.runtime.lastError.message}`);
          return;
        }
        if (response?.success) {
          showToast('success', '已開啟 Dcard，自動貼上中...');
        } else {
          showToast('error', response?.error || '貼到 Dcard 失敗');
        }
      });
    } catch (err) {
      setPasting(false);
      showToast('error', `貼到 Dcard 失敗: ${err.message}`);
    }
  };

  const statusColors = {
    generating: 'bg-orange-100 text-orange-600 animate-pulse',
    failed: 'bg-red-100 text-red-600',
    draft: 'bg-gray-100 text-gray-600',
    optimized: 'bg-green-100 text-green-600',
    published: 'bg-blue-100 text-blue-600',
  };

  const statusLabels = {
    generating: '生成中...',
    failed: '失敗',
    draft: '草稿',
    optimized: '已優化',
    published: '已發佈',
  };

  const typeLabels = {
    comparison: '比較文',
    review: '開箱文',
    seo: 'SEO 文章',
  };

  // 決定要顯示的內容：優先使用 content_with_images（含圖片）
  const displayContent = selectedArticle?.content_with_images || selectedArticle?.content || '';

  return (
    <div className="flex h-full relative">
      {/* Toast 通知 */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
          toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Article List */}
      <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">文章管理</h2>
            <div className="flex items-center gap-1">
              {articles.length > 0 && (
                <button
                  onClick={() => { setSelectMode(!selectMode); setSelectedIds([]); }}
                  className={`p-1.5 rounded-lg transition-colors active:scale-95 ${
                    selectMode ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-blue-500 hover:bg-blue-50'
                  }`}
                  title={selectMode ? '取消選取' : '批量選取'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </button>
              )}
              <button
                onClick={() => { invalidateCache('articles'); setLoading(true); loadArticles(); }}
                disabled={loading}
                className="p-1.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors active:scale-95 disabled:opacity-50"
                title="重新整理"
              >
                <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          {selectMode ? (
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedIds(selectedIds.length === articles.length ? [] : articles.map(a => a.id))}
                  className="text-xs text-blue-500 hover:text-blue-700 active:scale-95 transition-transform"
                >
                  {selectedIds.length === articles.length ? '取消全選' : '全選'}
                </button>
                <span className="text-xs text-gray-400">已選 {selectedIds.length} 篇</span>
              </div>
              <button
                onClick={handleBatchDelete}
                disabled={selectedIds.length === 0 || batchDeleting}
                className="px-2.5 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
              >
                {batchDeleting ? '刪除中...' : `🗑️ 刪除 (${selectedIds.length})`}
              </button>
            </div>
          ) : (
            <p className="text-xs text-gray-400 mt-1">{articles.length} 篇文章</p>
          )}
        </div>

        {loading ? (
          <div className="text-center py-10 text-gray-400">載入中...</div>
        ) : articles.length === 0 ? (
          <div className="text-center py-10 text-gray-400">
            <div className="text-3xl mb-2">📄</div>
            <p className="text-sm">尚無文章</p>
          </div>
        ) : (
          articles.map(article => (
            <div
              key={article.id}
              onClick={() => selectMode ? toggleSelectId(article.id) : selectArticle(article.id)}
              className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                selectMode && selectedIds.includes(article.id) ? 'bg-red-50' :
                !selectMode && selectedArticle?.id === article.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {selectMode && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(article.id)}
                    onChange={() => toggleSelectId(article.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400 shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-800 text-sm truncate">{article.title}</div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusColors[article.status] || ''}`}>
                      {statusLabels[article.status] || article.status}
                    </span>
                    <span className="text-xs text-gray-400">{typeLabels[article.article_type]}</span>
                    {article.seo_score && (
                      <span className="text-xs text-purple-500">SEO: {article.seo_score}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(article.created_at).toLocaleDateString('zh-TW')}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Article Detail */}
      <div className="flex-1 overflow-y-auto">
        {selectedArticle ? (
          <div className="p-6">
            {/* Title (editable) */}
            <div className="mb-3">
              {editingTitle ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-lg font-bold focus:outline-none focus:ring-2 focus:ring-blue-400"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                  />
                  <button onClick={handleSaveTitle} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 active:scale-95 transition-transform">💾 儲存</button>
                  <button onClick={() => { setEditingTitle(false); setEditTitle(selectedArticle.title); }} className="px-3 py-2 bg-gray-200 rounded-lg text-sm hover:bg-gray-300 active:scale-95 transition-transform">✕ 取消</button>
                </div>
              ) : (
                <h3
                  className="text-xl font-bold text-gray-800 cursor-pointer hover:text-blue-600 transition-colors group"
                  onClick={() => { setEditTitle(selectedArticle.title); setEditingTitle(true); }}
                  title="點擊編輯標題"
                >
                  {selectedArticle.title}
                  <span className="text-sm text-gray-300 ml-2 opacity-0 group-hover:opacity-100">✏️</span>
                </h3>
              )}
            </div>

            {/* Toolbar */}
            <div className="flex gap-2 mb-4">
              {selectedArticle.status !== 'failed' && (
                <>
                  <button onClick={handleCopy} className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:scale-95 transition-transform">
                    📋 複製
                  </button>
                  {extInstalled && (
                    <button
                      onClick={handlePasteToDcard}
                      disabled={pasting}
                      className="px-3 py-1.5 text-sm bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform"
                    >
                      {pasting ? '⏳ 開啟中...' : '📮 貼到 Dcard'}
                    </button>
                  )}
                  <button onClick={handleAnalyzeSeo} disabled={analyzing || optimizing} className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform">
                    {analyzing ? '分析中...' : '📊 SEO 分析'}
                  </button>
                  <button
                    onClick={handleOptimizeSeo}
                    disabled={optimizing || analyzing || !user?.is_approved}
                    className={`px-3 py-1.5 text-sm text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-transform ${
                      !user?.is_approved ? 'bg-gray-400' : 'bg-green-500 hover:bg-green-600'
                    }`}
                    title={!user?.is_approved ? '等待管理員核准' : ''}
                  >
                    {!user?.is_approved ? '🔒 等待核准' : optimizing ? '優化中...' : '🚀 SEO 優化'}
                  </button>
                </>
              )}
              <button onClick={() => handleDelete(selectedArticle.id)} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 active:scale-95 transition-transform">
                🗑️ 刪除
              </button>
            </div>

            {/* Optimizing Overlay */}
            {optimizing && (
              <div className="mb-4 p-4 bg-green-50 rounded-xl border border-green-200 flex items-center gap-3">
                <div className="animate-spin h-5 w-5 border-2 border-green-500 border-t-transparent rounded-full" />
                <span className="text-green-700 font-medium">SEO 優化中，請稍候（約 30-60 秒）...</span>
              </div>
            )}

            {/* SEO Panel */}
            {seoResult && (
              <div className="mb-4">
                <SeoPanel
                  data={seoResult}
                  optimized={seoOptimized}
                  beforeScore={seoBeforeScore}
                  beforeAnalysis={seoBeforeAnalysis}
                />
              </div>
            )}

            {/* Content */}
            {selectedArticle.status === 'failed' && selectedArticle.content ? (
              <div className="bg-red-50 rounded-xl border border-red-200 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-red-500 text-lg">⚠️</span>
                  <span className="font-bold text-red-700">錯誤診斷報告</span>
                </div>
                <pre className="whitespace-pre-wrap text-sm text-red-800 font-mono bg-red-100/50 rounded-lg p-4 overflow-x-auto">
                  {selectedArticle.content}
                </pre>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                {editing ? (
                  <div>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full h-96 p-4 border border-gray-200 rounded-lg font-mono text-sm resize-y"
                    />
                    <div className="flex gap-2 mt-3">
                      <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600 active:scale-95 transition-transform">💾 儲存</button>
                      <button onClick={() => { setEditing(false); setEditContent(selectedArticle.content || ''); }} className="px-4 py-2 bg-gray-200 rounded-lg text-sm hover:bg-gray-300 active:scale-95 transition-transform">✕ 取消</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <button
                      onClick={() => setEditing(true)}
                      className="mb-3 text-sm text-blue-500 hover:underline active:scale-95 transition-transform inline-block"
                    >
                      ✏️ 編輯內文
                    </button>
                    <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
                      <RenderContent text={displayContent} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Meta Info */}
            <div className="mt-4 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
              <div className="grid grid-cols-2 gap-2">
                <div>類型: {typeLabels[selectedArticle.article_type]}</div>
                <div>狀態: {statusLabels[selectedArticle.status] || selectedArticle.status}</div>
                <div>建立: {new Date(selectedArticle.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
                {selectedArticle.sub_id && (
                  <div>Sub_id: <code className="font-mono bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs">{selectedArticle.sub_id}</code></div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-4">📄</div>
              <p>選擇文章以查看詳情</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
