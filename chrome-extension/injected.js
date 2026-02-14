/**
 * Injected Script - 注入到蝦皮頁面上下文
 * 攔截 fetch/XHR 請求以獲取商品 API 數據
 */

(function () {
    'use strict';

    console.log('🔧 Dcard 文章生成器 - API 攔截器已啟動');

    // 商品 API 匹配模式
    const PRODUCT_API_PATTERNS = [
        /api\/v\d+\/item\/get/,
        /api\/v\d+\/pdp\/get_pc/,
        /api\/v\d+\/pdp\/get/,
        /api\/v\d+\/item_detail/,
    ];

    function isProductApi(url) {
        return PRODUCT_API_PATTERNS.some(pattern => pattern.test(url));
    }

    // 攔截 fetch
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        const response = await originalFetch.apply(this, args);

        const url = args[0]?.url || args[0];

        if (typeof url === 'string' && isProductApi(url)) {
            console.log('🎯 [Fetch] 匹配到商品 API:', url.substring(0, 80));
            try {
                const clonedResponse = response.clone();
                const data = await clonedResponse.json();

                let itemData = null;
                if (data.data?.item) {
                    itemData = data.data.item;
                } else if (data.item) {
                    itemData = data.item;
                } else if (data.data?.itemid || data.data?.item_id) {
                    itemData = data.data;
                } else if (data.itemid || data.item_id) {
                    itemData = data;
                }

                if (itemData && (itemData.itemid || itemData.item_id || itemData.itemID)) {
                    console.log('✅ [Fetch] 成功擷取商品:', itemData.name || itemData.title || '(無名稱)');

                    if (!itemData.itemid) {
                        itemData.itemid = itemData.item_id || itemData.itemID;
                    }
                    if (!itemData.shopid) {
                        itemData.shopid = itemData.shop_id || itemData.shopID;
                    }

                    window.postMessage({
                        type: 'SHOPEE_PRODUCT_DATA',
                        payload: itemData
                    }, '*');
                }
            } catch (e) {
                console.log('⚠️ [Fetch] 解析失敗:', e.message);
            }
        }

        return response;
    };

    // 攔截 XMLHttpRequest
    const originalXHROpen = XMLHttpRequest.prototype.open;
    const originalXHRSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
        this._url = url;
        return originalXHROpen.apply(this, [method, url, ...rest]);
    };

    XMLHttpRequest.prototype.send = function (...args) {
        this.addEventListener('load', function () {
            if (this._url && isProductApi(this._url)) {
                console.log('🎯 [XHR] 匹配到商品 API');
                try {
                    const data = JSON.parse(this.responseText);
                    const itemData = data.data || data.item || data;

                    if (itemData && (itemData.itemid || itemData.item_id)) {
                        if (itemData.item_id && !itemData.itemid) {
                            itemData.itemid = itemData.item_id;
                        }
                        window.postMessage({
                            type: 'SHOPEE_PRODUCT_DATA',
                            payload: itemData
                        }, '*');
                    }
                } catch (e) {
                    console.log('⚠️ [XHR] 解析失敗:', e.message);
                }
            }
        });

        return originalXHRSend.apply(this, args);
    };

    // 監聽來自 content script 的 API 代理請求
    window.addEventListener('message', async function(event) {
        if (event.source !== window) return;

        if (event.data.type === 'SHOPEE_FETCH_REQUEST') {
            const { requestId, url, options } = event.data;

            try {
                const response = await fetch(url, {
                    method: options?.method || 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'Accept-Language': 'zh-TW,zh;q=0.9',
                    }
                });

                if (!response.ok) {
                    window.postMessage({
                        type: 'SHOPEE_FETCH_RESPONSE',
                        requestId: requestId,
                        success: false,
                        status: response.status,
                        error: `HTTP ${response.status}`
                    }, '*');
                    return;
                }

                const data = await response.json();
                window.postMessage({
                    type: 'SHOPEE_FETCH_RESPONSE',
                    requestId: requestId,
                    success: true,
                    data: data
                }, '*');

            } catch (error) {
                window.postMessage({
                    type: 'SHOPEE_FETCH_RESPONSE',
                    requestId: requestId,
                    success: false,
                    error: error.message
                }, '*');
            }
        }
    });

    // 嘗試從 __NEXT_DATA__ 獲取數據
    function tryExtractFromPage() {
        const nextData = document.getElementById('__NEXT_DATA__');
        if (nextData) {
            try {
                const data = JSON.parse(nextData.textContent);
                const itemData = data?.props?.pageProps?.itemData ||
                    data?.props?.initialProps?.itemData;

                if (itemData && itemData.itemid) {
                    window.postMessage({
                        type: 'SHOPEE_PRODUCT_DATA',
                        payload: itemData
                    }, '*');
                }
            } catch (e) { }
        }
    }

    if (document.readyState === 'complete') {
        setTimeout(tryExtractFromPage, 1000);
    } else {
        window.addEventListener('load', () => {
            setTimeout(tryExtractFromPage, 1000);
        });
    }

    // 監聽 SPA 導航
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (location.href.includes('/product/') || location.href.match(/-i\.\d+\.\d+/)) {
                setTimeout(tryExtractFromPage, 1500);
            }
        }
    }).observe(document, { subtree: true, childList: true });

})();
