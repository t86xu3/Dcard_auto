import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'dcard_extension_id';
const ENV_EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID || '';

// 從 DOM 屬性偵測（content script 注入的標記，不受時序影響）
function detectFromDOM() {
  const id = document.documentElement.getAttribute('data-dcard-ext-id');
  if (!id) return null;
  return {
    extensionId: id,
    version: document.documentElement.getAttribute('data-dcard-ext-version') || '',
    name: document.documentElement.getAttribute('data-dcard-ext-name') || ''
  };
}

export function useExtensionDetect() {
  const [status, setStatus] = useState('checking');
  const [extensionInfo, setExtensionInfo] = useState(null);
  const [error, setError] = useState(null);
  const [extensionId, setExtensionId] = useState(null);

  const markInstalled = useCallback((id, version, name) => {
    setExtensionId(id);
    setExtensionInfo({ version, name });
    setStatus('installed');
    setError(null);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const verifyExtension = useCallback((id) => {
    if (!id) return;

    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      setStatus('not_installed');
      setError('不是 Chrome 瀏覽器');
      return;
    }

    const timeout = setTimeout(() => {
      setStatus('not_installed');
      setError('連線超時');
    }, 2000);

    try {
      chrome.runtime.sendMessage(id, { type: 'PING' }, (response) => {
        clearTimeout(timeout);
        if (chrome.runtime.lastError) {
          setStatus('not_installed');
          setError(chrome.runtime.lastError.message);
          return;
        }
        if (response?.type === 'PONG') {
          markInstalled(id, response.version, response.name);
        } else {
          setStatus('not_installed');
          setError('無效的回應');
        }
      });
    } catch (err) {
      clearTimeout(timeout);
      setStatus('not_installed');
      setError(err.message);
    }
  }, [markInstalled]);

  const retry = useCallback(() => {
    setStatus('checking');
    setError(null);

    // 優先嘗試 DOM 偵測
    const dom = detectFromDOM();
    if (dom) {
      markInstalled(dom.extensionId, dom.version, dom.name);
      return;
    }

    const savedId = localStorage.getItem(STORAGE_KEY);
    const idToTry = extensionId || savedId || ENV_EXTENSION_ID;
    if (idToTry) {
      verifyExtension(idToTry);
    } else {
      setStatus('not_installed');
      setError('尚未偵測到擴充功能');
    }
  }, [extensionId, markInstalled, verifyExtension]);

  useEffect(() => {
    // 1. 立即檢查 DOM 標記（最快）
    const dom = detectFromDOM();
    if (dom) {
      markInstalled(dom.extensionId, dom.version, dom.name);
      return;
    }

    // 2. 監聽 postMessage 廣播
    const handleMessage = (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'SHOPEE_EXTENSION_DETECTED') {
        const { extensionId: id, version, name } = event.data.payload;
        markInstalled(id, version, name);
        window.postMessage({ type: 'EXTENSION_ACK' }, '*');
      }
    };
    window.addEventListener('message', handleMessage);

    // 3. 輪詢 DOM 標記（等 content script 注入）
    const domPoll = setInterval(() => {
      const d = detectFromDOM();
      if (d) {
        clearInterval(domPoll);
        markInstalled(d.extensionId, d.version, d.name);
      }
    }, 200);

    // 4. 最終 fallback: 用已知 ID 嘗試 PING
    const fallbackTimeout = setTimeout(() => {
      if (status === 'checking') {
        const savedId = localStorage.getItem(STORAGE_KEY);
        const idToTry = savedId || ENV_EXTENSION_ID;
        if (idToTry) {
          verifyExtension(idToTry);
        } else {
          setStatus('not_installed');
          setError('尚未偵測到擴充功能');
        }
      }
    }, 3000);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearInterval(domPoll);
      clearTimeout(fallbackTimeout);
    };
  }, [status, markInstalled, verifyExtension]);

  return {
    status,
    extensionInfo,
    extensionId,
    error,
    retry,
    isInstalled: status === 'installed',
    isChecking: status === 'checking'
  };
}

export default useExtensionDetect;
