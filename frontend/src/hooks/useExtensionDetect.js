import { useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'dcard_extension_id';
const ENV_EXTENSION_ID = import.meta.env.VITE_EXTENSION_ID || '';

export function useExtensionDetect() {
  const [status, setStatus] = useState('checking');
  const [extensionInfo, setExtensionInfo] = useState(null);
  const [error, setError] = useState(null);
  const [extensionId, setExtensionId] = useState(null);

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
          setStatus('installed');
          setExtensionId(id);
          setExtensionInfo({ version: response.version, name: response.name });
          setError(null);
          localStorage.setItem(STORAGE_KEY, id);
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
  }, []);

  const retry = useCallback(() => {
    setStatus('checking');
    setError(null);
    const savedId = localStorage.getItem(STORAGE_KEY);
    const idToTry = extensionId || savedId || ENV_EXTENSION_ID;
    if (idToTry) {
      verifyExtension(idToTry);
    } else {
      setStatus('not_installed');
      setError('尚未偵測到擴充功能');
    }
  }, [extensionId, verifyExtension]);

  useEffect(() => {
    const handleMessage = (event) => {
      if (event.source !== window) return;
      if (event.data?.type === 'SHOPEE_EXTENSION_DETECTED') {
        const { extensionId: id, version, name } = event.data.payload;
        setExtensionId(id);
        setExtensionInfo({ version, name });
        setStatus('installed');
        setError(null);
        localStorage.setItem(STORAGE_KEY, id);
      }
    };

    window.addEventListener('message', handleMessage);

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
    }, 500);

    return () => {
      window.removeEventListener('message', handleMessage);
      clearTimeout(fallbackTimeout);
    };
  }, [status, verifyExtension]);

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
