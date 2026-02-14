import { useState } from 'react';
import { useExtensionDetect } from '../hooks/useExtensionDetect';

const FORUMS = [
  { id: 'goodthings', name: '好物研究室', desc: '通用商品推薦' },
  { id: 'makeup', name: '美妝', desc: '美妝、保養品比較' },
  { id: 'girls', name: '女孩版', desc: '生活用品、時尚' },
  { id: 'buymakeuptogether', name: '美妝團購', desc: '團購推薦' },
  { id: 'food', name: '美食', desc: '食品比較' },
];

export default function SettingsPage() {
  const { status, extensionInfo, extensionId, retry } = useExtensionDetect();
  const [defaultForum, setDefaultForum] = useState('goodthings');
  const [llmModel, setLlmModel] = useState('gemini-2.5-flash');

  return (
    <div className="p-8 max-w-2xl">
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
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">模型</label>
            <select
              value={llmModel}
              onChange={(e) => setLlmModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (快速)</option>
              <option value="gemini-2.5-pro">Gemini 2.5 Pro (品質)</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">Phase 1 使用 mock 回應，LLM 設定將在 Phase 2 生效</p>
          </div>
        </div>
      </section>

      {/* Default Forum */}
      <section className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">預設看板</h3>
        <div className="space-y-2">
          {FORUMS.map(forum => (
            <label
              key={forum.id}
              className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                defaultForum === forum.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="forum"
                value={forum.id}
                checked={defaultForum === forum.id}
                onChange={(e) => setDefaultForum(e.target.value)}
                className="text-blue-500"
              />
              <div>
                <div className="font-medium text-gray-800">{forum.name}</div>
                <div className="text-xs text-gray-400">{forum.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
}
