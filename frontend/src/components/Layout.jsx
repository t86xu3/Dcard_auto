import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: '儀表板', icon: '📊' },
  { to: '/products', label: '商品管理', icon: '🛒' },
  { to: '/articles', label: '文章管理', icon: '📝' },
  { to: '/usage', label: '費用追蹤', icon: '💰' },
  { to: '/settings', label: '設定', icon: '⚙️' },
  { to: '/guide', label: '使用說明', icon: '📖' },
];

export default function Layout() {
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-5 border-b border-gray-100">
          <h1 className="text-lg font-bold text-gray-800">📝 Dcard Auto</h1>
          <p className="text-xs text-gray-400 mt-1">文章自動生成系統</p>
        </div>
        <nav className="flex-1 p-3">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg mb-1 text-sm font-medium transition-colors ${
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
        </nav>
        <div className="p-4 border-t border-gray-100 text-xs text-gray-400">
          v0.1.0 · Phase 1
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
