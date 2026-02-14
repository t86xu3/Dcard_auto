/**
 * Content Script - 蝦皮頁面
 * 暫存商品資料，處理擷取請求
 */

(function () {
    'use strict';

    console.log('🛒 Dcard 文章生成器 - 蝦皮擷取已載入');

    let currentProductData = null;

    // 注入攔截腳本到頁面上下文
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('injected.js');
    script.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(script);

    // 監聽來自 injected.js 的商品資料
    window.addEventListener('message', function (event) {
        if (event.source !== window) return;

        if (event.data.type === 'SHOPEE_PRODUCT_DATA') {
            currentProductData = event.data.payload;
            console.log('📦 商品資料已就緒:', currentProductData?.title || currentProductData?.name || '(未知商品)');
        }
    });

    // 監聽來自 popup / background 的擷取請求
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.type === 'CAPTURE_PRODUCT') {
            if (currentProductData) {
                // 嘗試從 DOM 補充描述圖片
                const descriptionSelectors = [
                    '[class*="product-detail"] img:not([class*="rating"]):not([class*="review"])',
                    '[class*="item-description"] img',
                    '[class*="pdp-desc"] img',
                    '[data-sqe="description"] img'
                ];

                const excludePatterns = [
                    /\/avatar\//, /\/review\//, /\/rating\//,
                    /\/comment\//, /user.*upload/, /\/icon/
                ];

                let domImages = [];
                for (const selector of descriptionSelectors) {
                    try {
                        const imgs = document.querySelectorAll(selector);
                        imgs.forEach(img => {
                            if (img.src && !img.src.includes('data:image')) {
                                const shouldExclude = excludePatterns.some(pattern => pattern.test(img.src));
                                if (!shouldExclude && !domImages.includes(img.src)) {
                                    domImages.push(img.src);
                                }
                            }
                        });
                    } catch (e) { }
                }

                if (domImages.length > 0) {
                    if (!currentProductData.description_images) {
                        currentProductData.description_images = [];
                    }
                    const existing = new Set(currentProductData.description_images);
                    domImages.forEach(url => {
                        const cleanUrl = url.replace(/_tn$/, '');
                        if (!existing.has(cleanUrl)) {
                            currentProductData.description_images.push(cleanUrl);
                        }
                    });
                }

                // 傳送到 background 儲存
                chrome.runtime.sendMessage({
                    type: 'PRODUCT_DATA',
                    data: currentProductData
                }, () => {
                    showNotification(currentProductData?.title || currentProductData?.name || '商品');
                    sendResponse({ success: true });
                });
            } else {
                sendResponse({ success: false, error: '沒有商品資料' });
            }
        }
        return true;
    });

    function showNotification(productName) {
        const oldNotification = document.getElementById('dcard-scraper-notification');
        if (oldNotification) oldNotification.remove();

        const notification = document.createElement('div');
        notification.id = 'dcard-scraper-notification';
        notification.innerHTML = `
            <div style="
                position: fixed; top: 20px; right: 20px;
                background: linear-gradient(135deg, #3B82F6 0%, #6366F1 100%);
                color: white; padding: 16px 24px; border-radius: 12px;
                box-shadow: 0 4px 20px rgba(59, 130, 246, 0.4);
                z-index: 999999; font-size: 14px;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                animation: dcardSlideIn 0.3s ease-out; max-width: 300px;
            ">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <span style="font-size: 20px;">✅</span>
                    <div>
                        <div style="font-weight: 600;">已擷取商品</div>
                        <div style="font-size: 12px; opacity: 0.9; margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            ${productName.substring(0, 30)}${productName.length > 30 ? '...' : ''}
                        </div>
                    </div>
                </div>
            </div>
            <style>
                @keyframes dcardSlideIn {
                    from { transform: translateX(100px); opacity: 0; }
                    to { transform: translateX(0); opacity: 1; }
                }
            </style>
        `;
        document.body.appendChild(notification);
        setTimeout(() => notification.remove(), 2500);
    }
})();
