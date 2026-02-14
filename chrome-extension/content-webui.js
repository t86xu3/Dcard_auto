/**
 * Content Script for Web UI (localhost)
 * 自動廣播 Extension ID 讓前端偵測
 */

(function () {
    'use strict';

    const extensionId = chrome.runtime.id;
    const manifest = chrome.runtime.getManifest();

    window.postMessage({
        type: 'SHOPEE_EXTENSION_DETECTED',
        payload: {
            extensionId: extensionId,
            version: manifest.version,
            name: manifest.name
        }
    }, '*');

    console.log('📝 Dcard 文章生成器已偵測到 Web UI，Extension ID:', extensionId);
})();
