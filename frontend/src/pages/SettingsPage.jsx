import { useState, useEffect } from 'react';
import { useExtensionDetect } from '../hooks/useExtensionDetect';
import { getPrompts, createPrompt, updatePrompt, deletePrompt, setDefaultPrompt } from '../api/client';

export default function SettingsPage() {
  const { status, extensionInfo, extensionId, retry } = useExtensionDetect();
  const [llmModel, setLlmModel] = useState(() => localStorage.getItem('llmModel') || 'gemini-2.5-flash');

  const handleModelChange = (value) => {
    setLlmModel(value);
    localStorage.setItem('llmModel', value);
  };

  // Prompt 範本狀態
  const [templates, setTemplates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editContent, setEditContent] = useState('');
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const data = await getPrompts();
      setTemplates(data);
      // 預設選中第一個
      if (data.length > 0 && !selectedId) {
        setSelectedId(data[0].id);
        setEditName(data[0].name);
        setEditContent(data[0].content);
      }
    } catch (err) {
      console.error('載入範本失敗:', err);
    }
    setLoadingTemplates(false);
  };

  useEffect(() => { loadTemplates(); }, []);

  const handleSelect = (template) => {
    setIsNew(false);
    setSelectedId(template.id);
    setEditName(template.name);
    setEditContent(template.content);
  };

  const handleNew = () => {
    setIsNew(true);
    setSelectedId(null);
    setEditName('');
    setEditContent('');
  };

  const handleSave = async () => {
    if (!editName.trim() || !editContent.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        const created = await createPrompt({ name: editName, content: editContent });
        setIsNew(false);
        setSelectedId(created.id);
      } else {
        await updatePrompt(selectedId, { name: editName, content: editContent });
      }
      await loadTemplates();
    } catch (err) {
      alert('儲存失敗: ' + (err.response?.data?.detail || err.message));
    }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    const t = templates.find(t => t.id === id);
    if (t?.is_builtin) {
      alert('內建範本不可刪除');
      return;
    }
    if (!confirm('確定刪除此範本？')) return;
    try {
      await deletePrompt(id);
      if (selectedId === id) {
        setSelectedId(null);
        setEditName('');
        setEditContent('');
      }
      await loadTemplates();
    } catch (err) {
      alert('刪除失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await setDefaultPrompt(id);
      await loadTemplates();
    } catch (err) {
      alert('設定預設失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const selectedTemplate = templates.find(t => t.id === selectedId);
  const hasChanges = isNew || (selectedTemplate && (editName !== selectedTemplate.name || editContent !== selectedTemplate.content));

  return (
    <div className="p-8 max-w-5xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">設定</h2>

      {/* Extension */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">Chrome Extension</h3>
        <div className="flex items-center gap-3 mb-4">
          <span className={`w-3 h-3 rounded-full ${
            status === 'installed' ? 'bg-green-500' : status === 'checking' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
          }`} />
          <span className={status === 'installed' ? 'text-green-600' : status === 'checking' ? 'text-yellow-600' : 'text-red-500'}>
            {status === 'installed' ? '已連線' : status === 'checking' ? '偵測中...' : '未偵測到'}
          </span>
          {status === 'not_installed' && (
            <button onClick={retry} className="text-sm text-blue-500 hover:underline">重試</button>
          )}
        </div>
        {extensionInfo && (
          <div className="text-sm text-gray-500 space-y-1">
            <div>名稱: {extensionInfo.name}</div>
            <div>版本: {extensionInfo.version}</div>
            <div>ID: {extensionId}</div>
          </div>
        )}
      </section>

      {/* LLM */}
      <section className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">LLM 設定</h3>
        <div className="flex gap-6">
          {/* 左側：模型選擇 */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-600 mb-1">模型</label>
            <select
              value={llmModel}
              onChange={(e) => handleModelChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <optgroup label="Google Gemini">
                <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                <option value="gemini-2.5-pro">Gemini 2.5 Pro</option>
                <option value="gemini-3-pro-preview">Gemini 3 Pro (Preview)</option>
              </optgroup>
              <optgroup label="Anthropic Claude">
                <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
                <option value="claude-haiku-4-5">Claude Haiku 4.5</option>
              </optgroup>
            </select>
          </div>

          {/* 右側：價格比較表 */}
          <div className="w-96 shrink-0">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="pb-1.5 font-medium">模型</th>
                  <th className="pb-1.5 font-medium text-right">輸入</th>
                  <th className="pb-1.5 font-medium text-right">輸出</th>
                  <th className="pb-1.5 font-medium text-right">特性</th>
                </tr>
              </thead>
              <tbody className="text-gray-600">
                <tr><td colSpan="4" className="pt-1 pb-0.5 text-[10px] text-gray-400 font-medium">Google Gemini</td></tr>
                <tr className={`border-t border-gray-50 ${llmModel === 'gemini-2.5-flash' ? 'bg-blue-50/50' : ''}`}>
                  <td className="py-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 mr-1.5"/>Flash</td>
                  <td className="py-1.5 text-right font-mono">$0.15</td>
                  <td className="py-1.5 text-right font-mono">$0.60</td>
                  <td className="py-1.5 text-right text-green-600">便宜快速</td>
                </tr>
                <tr className={`border-t border-gray-50 ${llmModel === 'gemini-2.5-pro' ? 'bg-purple-50/50' : ''}`}>
                  <td className="py-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5"/>2.5 Pro</td>
                  <td className="py-1.5 text-right font-mono">$1.25</td>
                  <td className="py-1.5 text-right font-mono">$10.00</td>
                  <td className="py-1.5 text-right text-purple-600">高品質</td>
                </tr>
                <tr className={`border-t border-gray-50 ${llmModel === 'gemini-3-pro-preview' ? 'bg-amber-50/50' : ''}`}>
                  <td className="py-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"/>3 Pro</td>
                  <td className="py-1.5 text-right font-mono">$2.00</td>
                  <td className="py-1.5 text-right font-mono">$12.00</td>
                  <td className="py-1.5 text-right text-amber-600">最新旗艦</td>
                </tr>
                <tr><td colSpan="4" className="pt-2 pb-0.5 text-[10px] text-gray-400 font-medium">Anthropic Claude</td></tr>
                <tr className={`border-t border-gray-50 ${llmModel === 'claude-sonnet-4-5' ? 'bg-orange-50/50' : ''}`}>
                  <td className="py-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500 mr-1.5"/>Sonnet 4.5</td>
                  <td className="py-1.5 text-right font-mono">$3.00</td>
                  <td className="py-1.5 text-right font-mono">$15.00</td>
                  <td className="py-1.5 text-right text-orange-600">寫作最強</td>
                </tr>
                <tr className={`border-t border-gray-50 ${llmModel === 'claude-haiku-4-5' ? 'bg-teal-50/50' : ''}`}>
                  <td className="py-1.5"><span className="inline-block w-1.5 h-1.5 rounded-full bg-teal-500 mr-1.5"/>Haiku 4.5</td>
                  <td className="py-1.5 text-right font-mono">$1.00</td>
                  <td className="py-1.5 text-right font-mono">$5.00</td>
                  <td className="py-1.5 text-right text-teal-600">性價比高</td>
                </tr>
              </tbody>
            </table>
            <div className="text-[10px] text-gray-300 mt-1 text-right">USD / 1M tokens</div>
          </div>
        </div>
      </section>

      {/* Prompt 範本 */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">提示詞範本</h3>
          <button
            onClick={handleNew}
            className="px-3 py-1.5 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600"
          >
            + 新增範本
          </button>
        </div>

        {loadingTemplates ? (
          <div className="text-center py-8 text-gray-400">載入中...</div>
        ) : (
          <div className="flex gap-4" style={{ minHeight: '400px' }}>
            {/* 左側：範本列表 */}
            <div className="w-64 shrink-0 border-r border-gray-100 pr-4 space-y-1 overflow-y-auto">
              {templates.map(t => (
                <div
                  key={t.id}
                  onClick={() => handleSelect(t)}
                  className={`p-3 rounded-lg cursor-pointer transition-colors group ${
                    selectedId === t.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-800 text-sm truncate">{t.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {t.is_builtin && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">內建</span>
                        )}
                        {t.is_default && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-600 rounded">預設</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!t.is_default && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSetDefault(t.id); }}
                          className="text-xs text-blue-500 hover:text-blue-700 px-1"
                          title="設為預設"
                        >
                          設預設
                        </button>
                      )}
                      {!t.is_builtin && (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                          className="text-xs text-red-400 hover:text-red-600 px-1"
                          title="刪除"
                        >
                          刪除
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isNew && (
                <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
                  <div className="font-medium text-blue-600 text-sm">新範本</div>
                </div>
              )}
            </div>

            {/* 右側：編輯區 */}
            <div className="flex-1 flex flex-col min-w-0">
              {(selectedId || isNew) ? (
                <>
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="範本名稱"
                    className="px-3 py-2 border border-gray-200 rounded-lg text-sm mb-3 font-medium"
                  />
                  <textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="在此輸入 system prompt..."
                    className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none font-mono leading-relaxed"
                    style={{ minHeight: '300px' }}
                  />
                  <div className="flex items-center justify-between mt-3">
                    <div className="text-xs text-gray-400">
                      {editContent.length} 字
                    </div>
                    <button
                      onClick={handleSave}
                      disabled={saving || !hasChanges}
                      className={`px-4 py-2 rounded-lg text-sm font-medium ${
                        hasChanges
                          ? 'bg-blue-500 text-white hover:bg-blue-600'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      {saving ? '儲存中...' : '儲存'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                  選擇一個範本或新增範本
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
