import { useState, useEffect } from 'react';
import { getArticles, getArticle, updateArticle, deleteArticle, optimizeSeo, copyArticle, analyzeSeo } from '../api/client';

export default function ArticlesPage() {
  const [articles, setArticles] = useState([]);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [seoResult, setSeoResult] = useState(null);
  const [loading, setLoading] = useState(true);

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
      setSeoResult(null);
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

  const handleDelete = async (id) => {
    if (!confirm('確定刪除此文章？')) return;
    await deleteArticle(id);
    if (selectedArticle?.id === id) setSelectedArticle(null);
    await loadArticles();
  };

  const handleOptimizeSeo = async () => {
    if (!selectedArticle) return;
    try {
      const result = await optimizeSeo(selectedArticle.id);
      setSelectedArticle(result);
      alert(`SEO 優化完成！分數: ${result.seo_score}`);
      await loadArticles();
    } catch (err) {
      alert('SEO 優化失敗');
    }
  };

  const handleAnalyzeSeo = async () => {
    if (!selectedArticle) return;
    try {
      const result = await analyzeSeo({
        title: selectedArticle.title,
        content: selectedArticle.content || '',
      });
      setSeoResult(result);
    } catch (err) {
      alert('SEO 分析失敗');
    }
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

  const typeLabels = {
    comparison: '比較文',
    review: '開箱文',
    seo: 'SEO 文章',
  };

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
                  {article.status}
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
            {/* Toolbar */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">{selectedArticle.title}</h3>
              <div className="flex gap-2">
                <button onClick={handleCopy} className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                  📋 複製
                </button>
                <button onClick={handleAnalyzeSeo} className="px-3 py-1.5 text-sm bg-purple-500 text-white rounded-lg hover:bg-purple-600">
                  📊 SEO 分析
                </button>
                <button onClick={handleOptimizeSeo} className="px-3 py-1.5 text-sm bg-green-500 text-white rounded-lg hover:bg-green-600">
                  ✨ SEO 優化
                </button>
                <button onClick={() => handleDelete(selectedArticle.id)} className="px-3 py-1.5 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600">
                  🗑️
                </button>
              </div>
            </div>

            {/* SEO Panel */}
            {seoResult && (
              <div className="mb-4 p-4 bg-purple-50 rounded-xl border border-purple-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="font-semibold text-purple-800">SEO 分析結果</span>
                  <span className="text-2xl font-bold text-purple-600">
                    {seoResult.score} / {seoResult.max_score} ({seoResult.grade})
                  </span>
                </div>
                {seoResult.suggestions?.length > 0 && (
                  <ul className="text-sm text-purple-700 space-y-1">
                    {seoResult.suggestions.map((s, i) => (
                      <li key={i}>• {s}</li>
                    ))}
                  </ul>
                )}
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
                    ✏️ 編輯
                  </button>
                  <div className="prose prose-sm max-w-none whitespace-pre-wrap text-gray-700">
                    {selectedArticle.content || '（無內容）'}
                  </div>
                </div>
              )}
            </div>

            {/* Meta Info */}
            <div className="mt-4 p-4 bg-gray-50 rounded-xl text-sm text-gray-500">
              <div className="grid grid-cols-2 gap-2">
                <div>類型: {typeLabels[selectedArticle.article_type]}</div>
                <div>看板: {selectedArticle.target_forum}</div>
                <div>狀態: {selectedArticle.status}</div>
                <div>建立: {new Date(selectedArticle.created_at).toLocaleString('zh-TW')}</div>
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
