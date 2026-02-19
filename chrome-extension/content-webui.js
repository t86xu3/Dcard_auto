/**
 * Content Script for Web UI (localhost)
 * 自動廣播 Extension ID 讓前端偵測
 * 重複廣播直到前端確認收到（解決 React mount 時序問題）
 */

(function () {
    'use strict';

    const extensionId = chrome.runtime.id;
    const manifest = chrome.runtime.getManifest();
    let acked = false;

    const payload = {
        type: 'SHOPEE_EXTENSION_DETECTED',
        payload: {
            extensionId: extensionId,
            version: manifest.version,
            name: manifest.name
        }
    };

    // 收到前端 ACK 後停止廣播
    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        if (event.data?.type === 'EXTENSION_ACK') {
            acked = true;
        }
    });

    // 每 300ms 廣播一次，最多 10 秒
    function broadcast() {
        if (acked) return;
        window.postMessage(payload, '*');
    }

    broadcast();
    const interval = setInterval(() => {
        if (acked) {
            clearInterval(interval);
            return;
        }
        broadcast();
    }, 300);

    // 10 秒後無論如何停止
    setTimeout(() => clearInterval(interval), 10000);

    console.log('📝 Dcard 文章生成器已偵測到 Web UI，Extension ID:', extensionId);
})();
