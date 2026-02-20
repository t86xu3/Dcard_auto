import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// Request interceptor: 自動帶 Bearer token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: 401 自動刷新 token
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 401 且非 login/register/refresh 請求
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url.includes('/auth/')
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return api(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        isRefreshing = false;
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(error);
      }

      try {
        const resp = await axios.post('/api/auth/refresh', { refresh_token: refreshToken });
        const { access_token, refresh_token } = resp.data;
        localStorage.setItem('accessToken', access_token);
        localStorage.setItem('refreshToken', refresh_token);
        processQueue(null, access_token);
        originalRequest.headers.Authorization = `Bearer ${access_token}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        window.location.href = '/login';
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// 商品
export const getProducts = (skip = 0, limit = 100) =>
  api.get(`/products?skip=${skip}&limit=${limit}`).then(r => r.data);

export const getProduct = (id) =>
  api.get(`/products/${id}`).then(r => r.data);

export const updateProduct = (id, data) =>
  api.patch(`/products/${id}`, data).then(r => r.data);

export const deleteProduct = (id) =>
  api.delete(`/products/${id}`).then(r => r.data);

export const batchDeleteProducts = (ids) =>
  api.post('/products/batch-delete', { ids }).then(r => r.data);

export const downloadProductImages = (id) =>
  api.post(`/products/${id}/download-images`).then(r => r.data);

// 文章（非同步生成，立即回傳 placeholder）
export const generateArticle = (data) =>
  api.post('/articles/generate', data).then(r => r.data);

export const getArticles = (skip = 0, limit = 50) =>
  api.get(`/articles?skip=${skip}&limit=${limit}`).then(r => r.data);

export const getArticle = (id) =>
  api.get(`/articles/${id}`).then(r => r.data);

export const updateArticle = (id, data) =>
  api.put(`/articles/${id}`, data).then(r => r.data);

export const deleteArticle = (id) =>
  api.delete(`/articles/${id}`).then(r => r.data);

export const optimizeSeo = (id, model) =>
  api.post(`/articles/${id}/optimize-seo`, null, { params: model ? { model } : {}, timeout: 180000 }).then(r => r.data);

export const copyArticle = (id) =>
  api.get(`/articles/${id}/copy`).then(r => r.data);

export const getArticleImages = (id) =>
  api.get(`/articles/${id}/images`).then(r => r.data);

// Prompt 範本
export const getPrompts = () =>
  api.get('/prompts').then(r => r.data);

export const createPrompt = (data) =>
  api.post('/prompts', data).then(r => r.data);

export const updatePrompt = (id, data) =>
  api.put(`/prompts/${id}`, data).then(r => r.data);

export const deletePrompt = (id) =>
  api.delete(`/prompts/${id}`).then(r => r.data);

export const setDefaultPrompt = (id) =>
  api.post(`/prompts/${id}/set-default`).then(r => r.data);

// SEO
export const analyzeSeo = (data) =>
  api.post('/seo/analyze', data).then(r => r.data);

export const analyzeSeoById = (articleId) =>
  api.post(`/seo/analyze/${articleId}`).then(r => r.data);

// 用量
export const getUsage = () =>
  api.get('/usage').then(r => r.data);

export const getAdminUsage = () =>
  api.get('/admin/usage').then(r => r.data);

export const getSystemPrompts = () =>
  api.get('/admin/system-prompts').then(r => r.data);

export default api;
