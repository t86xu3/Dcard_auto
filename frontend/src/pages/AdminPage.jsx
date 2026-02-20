import { useState, useEffect } from 'react';
import api from '../api/client';
import { getSystemPrompts } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user: currentUser } = useAuth();
  const [systemPrompts, setSystemPrompts] = useState(null);
  const [promptsExpanded, setPromptsExpanded] = useState(false);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const resp = await api.get('/admin/users');
      setUsers(resp.data);
    } catch (err) {
      console.error('載入用戶列表失敗:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadUsers();
    getSystemPrompts()
      .then(setSystemPrompts)
      .catch(err => console.error('載入系統提示詞失敗:', err));
  }, []);

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
    <div className="p-8">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">用戶管理</h2>

      {loading ? (
        <div className="text-center py-20 text-gray-400">載入中...</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
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
                    {new Date(u.created_at).toLocaleDateString('zh-TW')}
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
      )}

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
              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-2">
                  系統指令 (SYSTEM_INSTRUCTIONS)
                </h3>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 font-mono whitespace-pre-wrap overflow-x-auto">
                  {systemPrompts.system_instructions}
                </pre>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-600 mb-2">
                  預設寫作範本 (DEFAULT_SYSTEM_PROMPT)
                </h3>
                <pre className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 font-mono whitespace-pre-wrap overflow-x-auto">
                  {systemPrompts.default_prompt}
                </pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
