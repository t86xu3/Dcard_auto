import { useState, useEffect } from 'react';
import { getArticles, getArticle, updateArticle, deleteArticle, optimizeSeo, copyArticle, analyzeSeo, analyzeSeoById } from '../api/client';
import SeoPanel from '../components/SeoPanel';

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
        className={`absolute top-2 right-2 px-2.5 py-1.5 rounded-lg text-xs font-medium shadow-md transition-all ${
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

  const loadArticles = async () => {
    setLoading(true);
    try {
      const data = await getArticles();
      setArticles(data);
    } catch (err) {
      console.error('載入文章失敗:', err);
    }
    setLoading(false);
  };

  useEffect(() => { loadArticles(); }, []);

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
      await loadArticles();
    } catch (err) {
      alert('標題儲存失敗');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('確定刪除此文章？')) return;
    await deleteArticle(id);
    if (selectedArticle?.id === id) setSelectedArticle(null);
    await loadArticles();
  };

  const handleOptimizeSeo = async () => {
    if (!selectedArticle) return;
    setOptimizing(true);
    try {
      const resp = await optimizeSeo(selectedArticle.id);
      setSelectedArticle(resp.article);
      setEditContent(resp.article.content || '');
      // 顯示優化後的完整分析
      setSeoResult(resp.after_analysis || resp.article.seo_suggestions);
      setSeoOptimized(true);
      setSeoBeforeScore(resp.before_score);
      setSeoBeforeAnalysis(resp.before_analysis || null);
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
      alert('已複製到剪貼簿！');
    } catch (err) {
      alert('複製失敗');
    }
  };

  const statusColors = {
    draft: 'bg-gray-100 text-gray-600',
    optimized: 'bg-green-100 text-green-600',
    published: 'bg-blue-100 text-blue-600',
  };

  const statusLabels = {
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
    <div className="flex h-full">
      {/* Article List */}
      <div className="w-80 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">文章管理</h2>
          <p className="text-xs text-gray-400 mt-1">{articles.length} 篇文章</p>
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
              onClick={() => selectArticle(article.id)}
              className={`p-4 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                selectedArticle?.id === article.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
            >
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
                  <button onClick={handleSaveTitle} className="px-3 py-2 bg-blue-500 text-white rounded-lg text-sm hover:bg-blue-600">儲存</button>
                  <button onClick={() => { setEditingTitle(false); setEditTitle(selectedArticle.title); }} className="px-3 py-2 bg-gray-200 rounded-lg text-sm hover:bg-gray-300">取消</button>
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
              <button onClick={handleCopy} className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                📋 複製
              </button>
              <button onClick={handleAnalyzeSeo} disabled={analyzing || optimizing} className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed">
                {analyzing ? '分析中...' : '📊 SEO 分析'}
              </button>
              <button onClick={handleOptimizeSeo} disabled={optimizing || analyzing} className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed">
                {optimizing ? '優化中...' : '✨ SEO 優化'}
              </button>
              <button onClick={() => handleDelete(selectedArticle.id)} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">
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
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              {editing ? (
                <div>
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="w-full h-96 p-4 border border-gray-200 rounded-lg font-mono text-sm resize-y"
                  />
                  <div className="flex gap-2 mt-3">
                    <button onClick={handleSave} className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm">儲存</button>
                    <button onClick={() => { setEditing(false); setEditContent(selectedArticle.content || ''); }} className="px-4 py-2 bg-gray-200 rounded-lg text-sm">取消</button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    onClick={() => setEditing(true)}
                    className="mb-3 text-sm text-blue-500 hover:underline"
                  >
                    ✏️ 編輯內文
                  </button>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
                    <RenderContent text={displayContent} />
                  </div>
                </div>
              )}
            </div>

            {/* Meta Info */}
            <div className="mt-4 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
              <div className="grid grid-cols-2 gap-2">
                <div>類型: {typeLabels[selectedArticle.article_type]}</div>
                <div>狀態: {statusLabels[selectedArticle.status] || selectedArticle.status}</div>
                <div>建立: {new Date(selectedArticle.created_at).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}</div>
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
