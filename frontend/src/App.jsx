import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import DashboardPage from './pages/DashboardPage';

// 路由分割：非首頁頁面延遲載入
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ArticlesPage = lazy(() => import('./pages/ArticlesPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const UsagePage = lazy(() => import('./pages/UsagePage'));
const GuidePage = lazy(() => import('./pages/GuidePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-gray-400">載入中...</div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            {/* 公開路由 */}
            <Route path="/login" element={<LoginPage />} />

            {/* 需要認證的路由 */}
            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/products" element={<ProductsPage />} />
                <Route path="/articles" element={<ArticlesPage />} />
                <Route path="/usage" element={<UsagePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/guide" element={<GuidePage />} />
                <Route path="/admin" element={<AdminPage />} />
              </Route>
            </Route>
          </Routes>
        </Suspense>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
