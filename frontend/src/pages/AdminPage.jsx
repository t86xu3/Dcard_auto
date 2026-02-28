import { useState, useEffect } from 'react';
import api from '../api/client';
import { getSystemPrompts, getAdminAnnouncements, createAnnouncement, updateAnnouncement, deleteAnnouncement, toggleAnnouncement } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { formatDate, formatDateTime } from '../utils/datetime';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();
  const [systemPrompts, setSystemPrompts] = useState(null);
  const [promptsExpanded, setPromptsExpanded] = useState(false);

  // 公告管理
  const [announcements, setAnnouncements] = useState([]);
  const [announcementsExpanded, setAnnouncementsExpanded] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const loadUsers = async () => {
    try {
      const resp = await api.get('/admin/users');
      setUsers(resp.data);
    } catch (err) {
      console.error('載入用戶列表失敗:', err);
    }
    setLoading(false);
  };

  const loadAnnouncements = async () => {
    try {
      const data = await getAdminAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      console.error('載入公告失敗:', err);
    }
  };

  useEffect(() => {
    loadUsers();
    loadAnnouncements();
    getSystemPrompts()
      .then(setSystemPrompts)
      .catch(err => console.error('載入系統提示詞失敗:', err));
  }, []);

  const handleCreateAnnouncement = async () => {
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      await createAnnouncement({ title: newTitle.trim(), content: newContent.trim() });
      setNewTitle('');
      setNewContent('');
      await loadAnnouncements();
    } catch (err) {
      alert('新增公告失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleUpdateAnnouncement = async (id) => {
    if (!editTitle.trim() || !editContent.trim()) return;
    try {
      await updateAnnouncement(id, { title: editTitle.trim(), content: editContent.trim() });
      setEditingId(null);
      await loadAnnouncements();
    } catch (err) {
      alert('更新公告失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleDeleteAnnouncement = async (id) => {
    if (!confirm('確定刪除此公告？')) return;
    try {
      await deleteAnnouncement(id);
      await loadAnnouncements();
    } catch (err) {
      alert('刪除公告失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleToggleAnnouncement = async (id) => {
    try {
      await toggleAnnouncement(id);
      await loadAnnouncements();
    } catch (err) {
      alert('切換公告狀態失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleApprove = async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/approve`);
      await loadUsers();
    } catch (err) {
      alert('核准失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleRevoke = async (userId) => {
    if (!confirm('確定撤銷此用戶的 LLM 權限？')) return;
    try {
      await api.post(`/admin/users/${userId}/revoke`);
      await loadUsers();
    } catch (err) {
      alert('撤銷失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleToggleActive = async (userId) => {
    try {
      await api.post(`/admin/users/${userId}/toggle-active`);
      await loadUsers();
    } catch (err) {
      alert('操作失敗: ' + (err.response?.data?.detail || err.message));
    }
  };

  return (
    <div className="p-4 md:p-8">
      <h2 className="text-xl md:text-2xl font-bold text-gray-800 mb-6">用戶管理</h2>

      {loading ? (
        <div className="text-center py-20 text-gray-400">載入中...</div>
      ) : (
        <>
          {/* 手機卡片列表 */}
          <div className="md:hidden space-y-3">
            {users.map(u => (
              <div key={u.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-medium text-gray-800">{u.username}</span>
                    {u.id === currentUser?.id && (
                      <span className="ml-1.5 text-xs text-blue-500">(你)</span>
                    )}
                  </div>
                  <span className="text-xs text-gray-400">#{u.id}</span>
                </div>
                <div className="text-sm text-gray-500 mb-2">{u.email}</div>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    u.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                  }`}>
                    {u.is_active ? '啟用' : '停用'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    u.is_admin ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {u.is_admin ? '管理員' : '一般'}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    u.is_approved ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-600'
                  }`}>
                    {u.is_approved ? '已核准' : '待核准'}
                  </span>
                  <span className="text-xs text-gray-400">{formatDate(u.created_at)}</span>
                </div>
                {!u.is_admin && (
                  <div className="flex gap-2">
                    {!u.is_approved ? (
                      <button
                        onClick={() => handleApprove(u.id)}
                        className="text-xs px-2.5 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 active:scale-95 transition-transform"
                      >
                        ✅ 核准
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRevoke(u.id)}
                        className="text-xs px-2.5 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 active:scale-95 transition-transform"
                      >
                        ⛔ 撤銷
                      </button>
                    )}
                    <button
                      onClick={() => handleToggleActive(u.id)}
                      className={`text-xs px-2.5 py-1 rounded-md text-white active:scale-95 transition-transform ${
                        u.is_active ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                      }`}
                    >
                      {u.is_active ? '🚫 停用' : '✅ 啟用'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* 桌面表格 */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="p-3">ID</th>
                  <th className="p-3">帳號</th>
                  <th className="p-3">Email</th>
                  <th className="p-3 w-24">狀態</th>
                  <th className="p-3 w-24">角色</th>
                  <th className="p-3 w-24">LLM 權限</th>
                  <th className="p-3 w-20">註冊時間</th>
                  <th className="p-3 w-40">操作</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 text-gray-400">{u.id}</td>
                    <td className="p-3 font-medium text-gray-800">
                      {u.username}
                      {u.id === currentUser?.id && (
                        <span className="ml-1.5 text-xs text-blue-500">(你)</span>
                      )}
                    </td>
                    <td className="p-3 text-gray-500">{u.email}</td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        u.is_active ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                      }`}>
                        {u.is_active ? '啟用' : '停用'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        u.is_admin ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {u.is_admin ? '管理員' : '一般'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        u.is_approved ? 'bg-blue-100 text-blue-600' : 'bg-yellow-100 text-yellow-600'
                      }`}>
                        {u.is_approved ? '已核准' : '待核准'}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-gray-400">
                      {formatDate(u.created_at)}
                    </td>
                    <td className="p-3">
                      {!u.is_admin && (
                        <div className="flex gap-2">
                          {!u.is_approved ? (
                            <button
                              onClick={() => handleApprove(u.id)}
                              className="text-xs px-2.5 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 active:scale-95 transition-transform"
                            >
                              ✅ 核准
                            </button>
                          ) : (
                            <button
                              onClick={() => handleRevoke(u.id)}
                              className="text-xs px-2.5 py-1 bg-yellow-500 text-white rounded-md hover:bg-yellow-600 active:scale-95 transition-transform"
                            >
                              ⛔ 撤銷
                            </button>
                          )}
                          <button
                            onClick={() => handleToggleActive(u.id)}
                            className={`text-xs px-2.5 py-1 rounded-md text-white active:scale-95 transition-transform ${
                              u.is_active ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                            }`}
                          >
                            {u.is_active ? '🚫 停用' : '✅ 啟用'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 公告管理 */}
      <div className="mt-8">
        <button
          onClick={() => setAnnouncementsExpanded(!announcementsExpanded)}
          className="flex items-center gap-2 text-xl font-bold text-gray-800 mb-4 hover:text-gray-600 active:scale-95 transition-all cursor-pointer"
        >
          <span className={`transition-transform ${announcementsExpanded ? 'rotate-90' : ''}`}>
            ▶
          </span>
          📢 公告管理
        </button>

        {announcementsExpanded && (
          <div className="space-y-4">
            {/* 新增公告表單 */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-600 mb-3">新增公告</h4>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="公告標題"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="公告內容"
                rows={3}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-3 resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <button
                onClick={handleCreateAnnouncement}
                disabled={!newTitle.trim() || !newContent.trim()}
                className="text-sm px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                📢 發佈公告
              </button>
            </div>

            {/* 公告列表 */}
            {announcements.length === 0 ? (
              <div className="text-center py-8 text-gray-400 text-sm">尚無公告</div>
            ) : (
              <div className="space-y-3">
                {announcements.map((a) => (
                  <div key={a.id} className={`bg-white rounded-xl border p-4 ${a.is_active ? 'border-blue-200' : 'border-gray-200 opacity-60'}`}>
                    {editingId === a.id ? (
                      // 編輯模式
                      <div className="space-y-2">
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-blue-300"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateAnnouncement(a.id)}
                            className="text-xs px-3 py-1.5 bg-green-500 text-white rounded-md hover:bg-green-600 active:scale-95 transition-transform"
                          >
                            💾 儲存
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="text-xs px-3 py-1.5 bg-gray-400 text-white rounded-md hover:bg-gray-500 active:scale-95 transition-transform"
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      // 顯示模式
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold text-gray-800">{a.title}</h4>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${a.is_active ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                              {a.is_active ? '啟用' : '停用'}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{formatDateTime(a.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap mb-3">{a.content}</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditingId(a.id);
                              setEditTitle(a.title);
                              setEditContent(a.content);
                            }}
                            className="text-xs px-2.5 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 active:scale-95 transition-transform"
                          >
                            ✏️ 編輯
                          </button>
                          <button
                            onClick={() => handleToggleAnnouncement(a.id)}
                            className={`text-xs px-2.5 py-1 rounded-md text-white active:scale-95 transition-transform ${a.is_active ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'}`}
                          >
                            {a.is_active ? '⏸️ 停用' : '▶️ 啟用'}
                          </button>
                          <button
                            onClick={() => handleDeleteAnnouncement(a.id)}
                            className="text-xs px-2.5 py-1 bg-red-500 text-white rounded-md hover:bg-red-600 active:scale-95 transition-transform"
                          >
                            🗑️ 刪除
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 系統提示詞 */}
      {systemPrompts && (
        <div className="mt-8">
          <button
            onClick={() => setPromptsExpanded(!promptsExpanded)}
            className="flex items-center gap-2 text-xl font-bold text-gray-800 mb-4 hover:text-gray-600 active:scale-95 transition-all cursor-pointer"
          >
            <span className={`transition-transform ${promptsExpanded ? 'rotate-90' : ''}`}>
              ▶
            </span>
            系統提示詞
          </button>

          {promptsExpanded && (
            <div className="space-y-6">
              {[
                { key: 'system_instructions', label: '系統指令 (SYSTEM_INSTRUCTIONS)', desc: '程式碼層級，所有範本共用，使用者看不到' },
                { key: 'seo_optimize_prompt', label: 'SEO 優化提示詞 (SEO_OPTIMIZE_PROMPT)', desc: '文章 SEO 優化時使用的提示詞' },
                { key: 'default_prompt', label: '範本 1：Dcard 好物推薦文', desc: '原始內建範本' },
                { key: 'default_prompt_v2', label: '範本 2：Google 排名衝刺版', desc: '基於 Google 首頁文章逆向工程' },
              ].map(({ key, label, desc }) => (
                systemPrompts[key] && (
                  <div key={key}>
                    <h3 className="text-sm font-semibold text-gray-600 mb-1">{label}</h3>
                    <p className="text-xs text-gray-400 mb-2">{desc}</p>
                    <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 font-mono whitespace-pre-wrap overflow-x-auto max-h-96 overflow-y-auto">
                      {systemPrompts[key]}
                    </pre>
                  </div>
                )
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
