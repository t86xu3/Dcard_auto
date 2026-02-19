import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // 啟動時檢查 token
  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (token) {
      fetchUser();
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUser = async () => {
    try {
      const resp = await api.get('/auth/me');
      setUser(resp.data);
    } catch {
      // token 無效，清除
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      setUser(null);
    }
    setLoading(false);
  };

  const login = async (username, password) => {
    const resp = await api.post('/auth/login', { username, password });
    localStorage.setItem('accessToken', resp.data.access_token);
    localStorage.setItem('refreshToken', resp.data.refresh_token);
    await fetchUser();
    return resp.data;
  };

  const register = async (username, email, password) => {
    const resp = await api.post('/auth/register', { username, email, password });
    localStorage.setItem('accessToken', resp.data.access_token);
    localStorage.setItem('refreshToken', resp.data.refresh_token);
    await fetchUser();
    return resp.data;
  };

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
