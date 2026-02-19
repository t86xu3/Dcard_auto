import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

// 商品
export const getProducts = (skip = 0, limit = 100) =>
  api.get(`/products?skip=${skip}&limit=${limit}`).then(r => r.data);

export const getProduct = (id) =>
  api.get(`/products/${id}`).then(r => r.data);

export const deleteProduct = (id) =>
  api.delete(`/products/${id}`).then(r => r.data);

export const batchDeleteProducts = (ids) =>
  api.post('/products/batch-delete', { ids }).then(r => r.data);

export const downloadProductImages = (id) =>
  api.post(`/products/${id}/download-images`).then(r => r.data);

// 文章（LLM 生成需要較長時間）
export const generateArticle = (data) =>
  api.post('/articles/generate', data, { timeout: 180000 }).then(r => r.data);

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

export default api;
