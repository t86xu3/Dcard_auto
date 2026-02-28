import { useState, useEffect, useRef } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const mainNavItems = [
  { to: '/', label: '儀表板', icon: '📊' },
  { to: '/products', label: '商品', icon: '🛒' },
  { to: '/explore', label: '探索', icon: '🔍' },
  { to: '/articles', label: '文章', icon: '📝' },
];

const sidebarNavItems = [
  { to: '/', label: '儀表板', icon: '📊' },
  { to: '/products', label: '商品管理', icon: '🛒' },
  { to: '/explore', label: '商品探索', icon: '🔍' },
  { to: '/articles', label: '文章管理', icon: '📝' },
  { to: '/usage', label: '費用追蹤', icon: '💰' },
  { to: '/settings', label: '設定', icon: '⚙️' },
  { to: '/guide', label: '使用說明', icon: '📖' },
];

const moreMenuItems = [
  { to: '/usage', label: '費用追蹤', icon: '💰' },
  { to: '/settings', label: '設定', icon: '⚙️' },
  { to: '/guide', label: '使用說明', icon: '📖' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const moreMenuRef = useRef(null);

  // 切頁自動關閉選單
  useEffect(() => {
    setMoreMenuOpen(false);
  }, [location.pathname]);

  // click-outside 關閉
  useEffect(() => {
    if (!moreMenuOpen) return;
    const handler = (e) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [moreMenuOpen]);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar - 桌面 */}
      <aside className="hidden md:flex w-56 bg-white border-r border-gray-200 flex-col">
        <div className="p-5 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-800">Dcard Auto</h1>
          <p className="text-xs text-gray-400 mt-1">文章自動生成系統</p>
        </div>
        <nav className="flex-1 p-3">
          {sidebarNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg mb-1 text-sm font-medium transition-all active:scale-95 ${
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          {/* 管理員專用 */}
          {user?.is_admin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg mb-1 text-sm font-medium transition-all active:scale-95 ${
                  isActive
                    ? 'bg-purple-50 text-purple-600'
                    : 'text-gray-600 hover:bg-gray-50'
                }`
              }
            >
              <span>👥</span>
              用戶管理
            </NavLink>
          )}
        </nav>

        {/* 用戶資訊 + 登出 */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold">
              {user?.username?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-800 truncate">{user?.username}</div>
              <div className="flex items-center gap-1.5">
                {user?.is_admin && (
                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">管理員</span>
                )}
                {user?.is_approved ? (
                  <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-600 rounded">已核准</span>
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-600 rounded">待核准</span>
                )}
              </div>
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-red-500 transition-all active:scale-95"
              title="登出"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 011 1v12a1 1 0 11-2 0V4a1 1 0 011-1zm7.707 3.293a1 1 0 010 1.414L9.414 9H17a1 1 0 110 2H9.414l1.293 1.293a1 1 0 01-1.414 1.414l-3-3a1 1 0 010-1.414l3-3a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
        <Outlet />
      </main>

      {/* 底部導航列 - 手機 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-40">
        <div className="flex items-center justify-around h-14">
          {mainNavItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors active:scale-95 ${
                  isActive ? 'text-blue-600' : 'text-gray-400'
                }`
              }
            >
              <span className="text-lg">{item.icon}</span>
              <span className="text-[10px] font-medium">{item.label}</span>
            </NavLink>
          ))}

          {/* 更多按鈕 */}
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setMoreMenuOpen(!moreMenuOpen)}
              className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 rounded-lg transition-colors active:scale-95 ${
                moreMenuOpen ? 'text-blue-600' : 'text-gray-400'
              }`}
            >
              <span className="text-lg">⋯</span>
              <span className="text-[10px] font-medium">更多</span>
            </button>

            {/* 浮動選單 */}
            {moreMenuOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-48 bg-white rounded-xl shadow-lg border border-gray-200 py-2 overflow-hidden">
                {moreMenuItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors active:scale-95 ${
                        isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-600 hover:bg-gray-50'
                      }`
                    }
                  >
                    <span>{item.icon}</span>
                    {item.label}
                  </NavLink>
                ))}
                {user?.is_admin && (
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors active:scale-95 ${
                        isActive ? 'bg-purple-50 text-purple-600' : 'text-gray-600 hover:bg-gray-50'
                      }`
                    }
                  >
                    <span>👥</span>
                    用戶管理
                  </NavLink>
                )}
                {/* 用戶資訊 */}
                <div className="border-t border-gray-100 mt-1 pt-1">
                  <div className="flex items-center gap-3 px-4 py-2">
                    <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
                      {user?.username?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <span className="text-sm text-gray-700 font-medium truncate">{user?.username}</span>
                    <div className="flex items-center gap-1 ml-auto">
                      {user?.is_admin && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded">管理員</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={logout}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50 w-full transition-colors active:scale-95"
                  >
                    <span>🚪</span>
                    登出
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </nav>
    </div>
  );
}
