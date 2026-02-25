/**
 * Background Service Worker
 * 資料處理、儲存、後端同步
 */

// API 端點設定
const API_BASE_URL = 'https://dcard-auto.web.app/api';
let authToken = null;

// 批量擷取狀態
let batchCapture = {
    active: false,
    items: [],          // [{ productId, url }]
    currentIndex: 0,
    currentTabId: null,
    results: [],        // [{ productId, status: 'success'|'failed'|'timeout', name? }]
    timeoutTimer: null,
    accessToken: null,  // 前端傳來的 token（備用）
};

// 啟動時從 storage 讀取 token
chrome.storage.local.get(['authToken']).then(({ authToken: token }) => {
    if (token) {
        authToken = token;
    }
});

/**
 * 取得帶認證的 headers
 */
function getAuthHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    return headers;
}

// 外部訊息監聽（Web UI 偵測 + 自動貼文）
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
        sendResponse({
            type: 'PONG',
            version: chrome.runtime.getManifest().version,
            name: chrome.runtime.getManifest().name
        });
    }

    // 從 Web UI 觸發「貼到 Dcard」
    if (message.type === 'PASTE_ARTICLE_TO_DCARD') {
        handlePasteArticleToDcard(message.data).then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 批量擷取：啟動
    if (message.type === 'BATCH_CAPTURE_START') {
        startBatchCapture(message.data).then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 批量擷取：查詢進度
    if (message.type === 'BATCH_CAPTURE_STATUS') {
        sendResponse(getBatchCaptureStatus());
    }

    // 批量擷取：取消
    if (message.type === 'BATCH_CAPTURE_CANCEL') {
        cancelBatchCapture().then(result => {
            sendResponse(result);
        });
        return true;
    }

    return true;
});

// 內部訊息監聽
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PRODUCT_DATA') {
        // 偵測是否為批量擷取的自動資料
        if (batchCapture.active && batchCapture.currentTabId && sender.tab?.id === batchCapture.currentTabId) {
            handleBatchProductData(message.data);
        } else {
            handleProductData(message.data);
        }
        sendResponse({ success: true });
    }

    if (message.type === 'GET_PRODUCTS') {
        getStoredProducts().then(products => {
            sendResponse({ products });
        });
        return true;
    }

    if (message.type === 'CLEAR_PRODUCTS') {
        clearStoredProducts().then(() => {
            sendResponse({ success: true });
        });
        return true;
    }

    if (message.type === 'DELETE_PRODUCT') {
        deleteProduct(message.itemid).then(result => {
            sendResponse(result);
        });
        return true;
    }

    if (message.type === 'SYNC_ALL_TO_BACKEND') {
        syncAllToBackend().then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 生成文章
    if (message.type === 'GENERATE_ARTICLE') {
        generateArticle(message.data).then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 取得文章列表
    if (message.type === 'GET_ARTICLES') {
        fetchArticles().then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 複製文章
    if (message.type === 'COPY_ARTICLE') {
        copyArticle(message.articleId).then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 貼到 Dcard
    if (message.type === 'PASTE_TO_DCARD') {
        pasteToActiveDcardTab(message.data).then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 取得待貼文章
    if (message.type === 'GET_PENDING_ARTICLE') {
        chrome.storage.local.get('pendingArticle').then(data => {
            sendResponse({ article: data.pendingArticle || null });
        });
        return true;
    }

    // 登入
    if (message.type === 'LOGIN') {
        loginToBackend(message.username, message.password).then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 登出
    if (message.type === 'LOGOUT') {
        authToken = null;
        chrome.storage.local.remove('authToken');
        sendResponse({ success: true });
        return true;
    }

    // 取得認證狀態
    if (message.type === 'GET_AUTH_STATUS') {
        getAuthStatus().then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 下載圖片 blob（供 content-dcard.js 使用，避免 CORS）
    if (message.type === 'FETCH_IMAGE_BLOB') {
        fetchImageBlob(message.url).then(result => {
            sendResponse(result);
        });
        return true;
    }

    // 清除 Dcard cookies（排解 Cloudflare 503 封鎖）
    if (message.type === 'CLEAR_DCARD_COOKIES') {
        clearDcardCookies().then(result => {
            sendResponse(result);
        });
        return true;
    }

});

/**
 * 處理商品資料
 */
async function handleProductData(productData) {
    const itemId = productData.itemid || productData.item_id;
    const shopId = productData.shopid || productData.shop_id;

    if (!productData || !itemId) return;

    const { products = [] } = await chrome.storage.local.get('products');
    const existingIndex = products.findIndex(p => p.itemid === itemId);

    // 處理圖片
    let images = [];
    if (Array.isArray(productData.images)) {
        images = productData.images.map(hash =>
            hash.startsWith('http') ? hash : `https://down-tw.img.susercontent.com/file/${hash}`
        );
    } else if (productData.image) {
        const hash = productData.image;
        images = [hash.startsWith('http') ? hash : `https://down-tw.img.susercontent.com/file/${hash}`];
    }

    // 處理描述圖片
    let descriptionImages = [];
    const descImgSources = productData.description_images || productData.desc_images ||
        productData.item_description_images || [];

    if (Array.isArray(descImgSources) && descImgSources.length > 0) {
        descriptionImages = descImgSources.map(hash => {
            if (typeof hash === 'string') {
                return hash.startsWith('http') ? hash : `https://down-tw.img.susercontent.com/file/${hash}`;
            }
            return '';
        }).filter(url => url);
    }

    const formattedProduct = {
        itemid: itemId,
        shopid: shopId,
        name: productData.name || productData.title || '',
        price: productData.price ? productData.price / 100000 : 0,
        originalPrice: productData.price_before_discount ? productData.price_before_discount / 100000 : 0,
        discount: productData.raw_discount || productData.show_discount || 0,
        description: productData.description || '',
        sold: productData.historical_sold || productData.sold || 0,
        rating: productData.item_rating?.rating_star || 0,
        shopName: productData.shop_info?.name || '',
        images: images,
        descriptionImages: descriptionImages,
        url: `https://shopee.tw/product/${shopId}/${itemId}`,
        capturedAt: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        products[existingIndex] = formattedProduct;
    } else {
        products.push(formattedProduct);
    }

    await chrome.storage.local.set({ products });

    // 更新 badge
    chrome.action.setBadgeText({ text: products.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' });

    // 同步到後端
    await syncToBackend(formattedProduct);
}

/**
 * 同步單一商品到後端
 */
async function syncToBackend(product) {
    try {
        const payload = {
            item_id: String(product.itemid),
            shop_id: String(product.shopid || ''),
            name: product.name,
            price: product.price,
            original_price: product.originalPrice,
            discount: product.discount ? `${product.discount}%` : null,
            description: product.description,
            images: product.images,
            description_images: product.descriptionImages,
            rating: product.rating,
            sold: product.sold,
            shop_name: product.shopName,
            product_url: product.url
        };

        const response = await fetch(`${API_BASE_URL}/products`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            console.log(`✅ 已同步到後端: ${product.name}`);
        } else if (response.status === 400) {
            console.log(`⏭️ 商品已存在: ${product.name}`);
        } else if (response.status === 401) {
            console.log('⚠️ 未登入或 Token 過期');
        }
    } catch (error) {
        console.log('⚠️ 後端未啟動，僅儲存本地');
    }
}

/**
 * 同步所有商品到後端
 */
async function syncAllToBackend() {
    const { products = [] } = await chrome.storage.local.get('products');

    if (products.length === 0) {
        return { success: false, error: '沒有商品可同步' };
    }

    let successCount = 0, skipCount = 0, failCount = 0;

    for (const product of products) {
        try {
            const payload = {
                item_id: String(product.itemid),
                shop_id: String(product.shopid || ''),
                name: product.name,
                price: product.price,
                original_price: product.originalPrice,
                discount: product.discount ? `${product.discount}%` : null,
                description: product.description,
                images: product.images,
                description_images: product.descriptionImages,
                rating: product.rating,
                sold: product.sold,
                shop_name: product.shopName,
                product_url: product.url
            };

            const response = await fetch(`${API_BASE_URL}/products`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });

            if (response.ok) successCount++;
            else if (response.status === 409 || response.status === 400) skipCount++;
            else if (response.status === 401) return { success: false, error: '請先登入' };
            else failCount++;
        } catch (error) {
            failCount++;
        }
    }

    return {
        success: true,
        total: products.length,
        synced: successCount,
        skipped: skipCount,
        failed: failCount
    };
}

async function getStoredProducts() {
    const { products = [] } = await chrome.storage.local.get('products');
    return products;
}

async function deleteProduct(itemid) {
    const { products = [] } = await chrome.storage.local.get('products');
    const newProducts = products.filter(p => p.itemid !== itemid);
    await chrome.storage.local.set({ products: newProducts });

    if (newProducts.length > 0) {
        chrome.action.setBadgeText({ text: newProducts.length.toString() });
    } else {
        chrome.action.setBadgeText({ text: '' });
    }

    return { success: true, remaining: newProducts.length };
}

async function clearStoredProducts() {
    await chrome.storage.local.set({ products: [] });
    chrome.action.setBadgeText({ text: '' });
}

/**
 * 生成文章（呼叫後端 API）
 */
async function generateArticle(data) {
    try {
        const response = await fetch(`${API_BASE_URL}/articles/generate`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify(data)
        });

        if (response.ok) {
            const article = await response.json();
            return { success: true, article };
        } else {
            const error = await response.text();
            return { success: false, error };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 取得文章列表
 */
async function fetchArticles() {
    try {
        const response = await fetch(`${API_BASE_URL}/articles`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const articles = await response.json();
            return { success: true, articles };
        }
        return { success: false, error: 'API 錯誤' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 複製文章（取得 Dcard 格式化內容）
 */
async function copyArticle(articleId) {
    try {
        const response = await fetch(`${API_BASE_URL}/articles/${articleId}/copy`, {
            headers: getAuthHeaders()
        });
        if (response.ok) {
            const data = await response.json();
            return { success: true, data };
        }
        return { success: false, error: 'API 錯誤' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 貼到 Dcard 活動頁籤（舊版：僅轉發到已開啟的 Dcard 頁面）
 */
async function pasteToActiveDcardTab(articleData) {
    try {
        // 儲存待貼文章
        await chrome.storage.local.set({ pendingArticle: articleData });

        // 尋找 Dcard 頁籤
        const tabs = await chrome.tabs.query({ url: 'https://www.dcard.tw/*' });
        if (tabs.length > 0) {
            await chrome.tabs.sendMessage(tabs[0].id, {
                type: 'PASTE_TO_DCARD',
                data: articleData
            });
            return { success: true };
        }
        return { success: false, error: '請先開啟 Dcard 頁面' };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * 下載圖片並回傳 dataUrl（供 content-dcard.js 避免 CORS）
 */
async function fetchImageBlob(imageUrl) {
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        const type = blob.type || 'image/jpeg';

        // 轉為 dataUrl
        const reader = new FileReader();
        const dataUrl = await new Promise((resolve, reject) => {
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

        return { success: true, dataUrl, type };
    } catch (error) {
        // fallback: 嘗試透過後端 image-proxy
        try {
            const proxyUrl = `${API_BASE_URL}/articles/image-proxy?url=${encodeURIComponent(imageUrl)}`;
            const response = await fetch(proxyUrl, { headers: getAuthHeaders() });
            if (!response.ok) throw new Error(`Proxy HTTP ${response.status}`);
            const blob = await response.blob();
            const type = blob.type || 'image/jpeg';
            const reader = new FileReader();
            const dataUrl = await new Promise((resolve, reject) => {
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            return { success: true, dataUrl, type };
        } catch (proxyError) {
            return { success: false, error: `圖片下載失敗: ${error.message}` };
        }
    }
}

/**
 * 從 Web UI 觸發的自動貼文流程：
 * 1. 先透過後端 API 取得文章資料
 * 2. 找到或開啟 Dcard 發文頁面
 * 3. 等待頁面載入完成
 * 4. 轉發 AUTO_PASTE_ARTICLE 給 content-dcard.js
 */
async function handlePasteArticleToDcard(data) {
    try {
        const { articleId, forum, accessToken } = data;

        // 1. 取得文章 copy 資料（優先使用前端傳來的 token）
        const headers = { 'Content-Type': 'application/json' };
        const token = accessToken || authToken;
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        const response = await fetch(`${API_BASE_URL}/articles/${articleId}/copy`, {
            headers
        });
        if (!response.ok) {
            const err = await response.text();
            return { success: false, error: `取得文章失敗: ${err}` };
        }
        const articleData = await response.json();

        // 2. 找到或開啟 Dcard 發文頁面
        const dcardNewUrl = 'https://www.dcard.tw/new-post?type=classic';
        let dcardTab = null;

        // 先找已開啟的 Dcard 發文頁面
        const tabs = await chrome.tabs.query({ url: 'https://www.dcard.tw/new-post*' });
        if (tabs.length > 0) {
            dcardTab = tabs[0];
            await chrome.tabs.update(dcardTab.id, { active: true });
        } else {
            // 開啟新分頁
            dcardTab = await chrome.tabs.create({ url: dcardNewUrl, active: true });
        }

        // 3. 等待頁面載入完成後傳送文章資料
        const waitForTab = (tabId) => new Promise((resolve) => {
            const check = (updatedTabId, changeInfo) => {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(check);
                    resolve();
                }
            };
            chrome.tabs.onUpdated.addListener(check);

            // 如果已經載入完成就直接 resolve
            chrome.tabs.get(tabId, (tab) => {
                if (tab.status === 'complete') {
                    chrome.tabs.onUpdated.removeListener(check);
                    resolve();
                }
            });
        });

        await waitForTab(dcardTab.id);

        // 給頁面一點時間讓編輯器初始化
        await new Promise(r => setTimeout(r, 1500));

        // 4. 傳送文章到 content-dcard.js
        await chrome.tabs.sendMessage(dcardTab.id, {
            type: 'AUTO_PASTE_ARTICLE',
            data: articleData
        });

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ==========================================
// 批量擷取功能
// ==========================================

/**
 * 啟動批量擷取
 * @param {Object} data - { items: [{ productId, url }], accessToken? }
 */
async function startBatchCapture(data) {
    if (batchCapture.active) {
        return { success: false, error: '已有擷取任務進行中' };
    }

    const { items, accessToken } = data;
    if (!items || items.length === 0) {
        return { success: false, error: '沒有待擷取項目' };
    }

    // 使用前端傳來的 token（若有）
    if (accessToken) {
        batchCapture.accessToken = accessToken;
    }

    batchCapture.active = true;
    batchCapture.items = items;
    batchCapture.currentIndex = 0;
    batchCapture.currentTabId = null;
    batchCapture.results = [];
    batchCapture.timeoutTimer = null;

    console.log(`🚀 批量擷取啟動: ${items.length} 個商品`);
    processNextItem();
    return { success: true, total: items.length };
}

/**
 * 處理下一個待擷取項目
 */
async function processNextItem() {
    if (!batchCapture.active) return;

    if (batchCapture.currentIndex >= batchCapture.items.length) {
        finishBatchCapture();
        return;
    }

    const item = batchCapture.items[batchCapture.currentIndex];
    console.log(`📦 批量擷取 [${batchCapture.currentIndex + 1}/${batchCapture.items.length}]: ${item.url}`);

    try {
        // 背景開啟分頁（active: false）
        const url = item.url.includes('#') ? item.url.split('#')[0] : item.url;
        const tab = await chrome.tabs.create({
            url: `${url}#dcard-auto-capture`,
            active: false
        });
        batchCapture.currentTabId = tab.id;

        // 設定 30 秒逾時
        batchCapture.timeoutTimer = setTimeout(() => {
            handleItemTimeout();
        }, 30000);

    } catch (error) {
        console.error('❌ 開啟分頁失敗:', error.message);
        batchCapture.results.push({
            productId: item.productId,
            status: 'failed',
            error: error.message
        });
        batchCapture.currentIndex++;
        processNextItem();
    }
}

/**
 * 處理批量擷取收到的商品資料
 */
async function handleBatchProductData(productData) {
    // 清除逾時計時器
    if (batchCapture.timeoutTimer) {
        clearTimeout(batchCapture.timeoutTimer);
        batchCapture.timeoutTimer = null;
    }

    const item = batchCapture.items[batchCapture.currentIndex];
    const productName = productData.name || productData.title || '(未知)';
    console.log(`✅ 批量擷取成功: ${productName}`);

    // 正常處理商品資料（儲存本地 + 同步後端）
    await handleProductData(productData);

    // 記錄結果
    batchCapture.results.push({
        productId: item.productId,
        status: 'success',
        name: productName
    });

    // 關閉分頁
    await closeBatchTab();

    // 2-4 秒隨機延遲再處理下一個
    const delay = 2000 + Math.random() * 2000;
    batchCapture.currentIndex++;
    setTimeout(() => processNextItem(), delay);
}

/**
 * 處理單項逾時
 */
async function handleItemTimeout() {
    if (!batchCapture.active) return;

    const item = batchCapture.items[batchCapture.currentIndex];
    console.log(`⏰ 批量擷取逾時: ${item.url}`);

    batchCapture.results.push({
        productId: item.productId,
        status: 'timeout',
        error: '擷取逾時（30秒）'
    });

    // 關閉分頁
    await closeBatchTab();

    // 下一個
    batchCapture.currentIndex++;
    setTimeout(() => processNextItem(), 1000);
}

/**
 * 關閉當前批量擷取的分頁
 */
async function closeBatchTab() {
    if (batchCapture.currentTabId) {
        try {
            await chrome.tabs.remove(batchCapture.currentTabId);
        } catch (e) {
            // 分頁可能已被手動關閉
        }
        batchCapture.currentTabId = null;
    }
}

/**
 * 取得批量擷取進度
 */
function getBatchCaptureStatus() {
    if (!batchCapture.active) {
        // 檢查是否剛剛完成
        if (batchCapture.results.length > 0 && batchCapture.items.length > 0) {
            return {
                status: 'complete',
                current: batchCapture.items.length,
                total: batchCapture.items.length,
                results: batchCapture.results,
                successCount: batchCapture.results.filter(r => r.status === 'success').length,
                failedCount: batchCapture.results.filter(r => r.status !== 'success').length,
            };
        }
        return { status: 'idle' };
    }

    return {
        status: 'running',
        current: batchCapture.currentIndex,
        total: batchCapture.items.length,
        results: batchCapture.results,
        currentItem: batchCapture.items[batchCapture.currentIndex] || null,
        successCount: batchCapture.results.filter(r => r.status === 'success').length,
        failedCount: batchCapture.results.filter(r => r.status !== 'success').length,
    };
}

/**
 * 取消批量擷取
 */
async function cancelBatchCapture() {
    if (!batchCapture.active) {
        return { success: false, error: '沒有進行中的擷取' };
    }

    console.log('⛔ 批量擷取已取消');

    if (batchCapture.timeoutTimer) {
        clearTimeout(batchCapture.timeoutTimer);
        batchCapture.timeoutTimer = null;
    }

    await closeBatchTab();

    // 未處理的項目標記為 cancelled
    for (let i = batchCapture.currentIndex; i < batchCapture.items.length; i++) {
        batchCapture.results.push({
            productId: batchCapture.items[i].productId,
            status: 'cancelled'
        });
    }

    batchCapture.active = false;

    return {
        success: true,
        results: batchCapture.results,
        successCount: batchCapture.results.filter(r => r.status === 'success').length,
    };
}

/**
 * 完成批量擷取
 */
function finishBatchCapture() {
    console.log(`🎉 批量擷取完成: ${batchCapture.results.filter(r => r.status === 'success').length}/${batchCapture.items.length} 成功`);
    batchCapture.active = false;
    batchCapture.currentTabId = null;
    batchCapture.timeoutTimer = null;
}

/**
 * 登入後端
 */
async function loginToBackend(username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (response.ok) {
            const data = await response.json();
            authToken = data.access_token;
            await chrome.storage.local.set({ authToken });
            return { success: true, username: data.username || username };
        } else {
            const error = await response.json().catch(() => ({}));
            return { success: false, error: error.detail || '帳號或密碼錯誤' };
        }
    } catch (error) {
        return { success: false, error: '無法連線到後端' };
    }
}

/**
 * 檢查認證狀態（用 /auth/me 驗證 token 是否有效）
 */
async function getAuthStatus() {
    // Service Worker 重啟後記憶體變數會被清空，需從 storage 重新載入
    if (!authToken) {
        const data = await chrome.storage.local.get(['authToken']);
        if (data.authToken) {
            authToken = data.authToken;
        } else {
            return { loggedIn: false };
        }
    }

    try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
        });

        if (response.ok) {
            const user = await response.json();
            return { loggedIn: true, username: user.username };
        } else {
            // Token 過期或無效
            authToken = null;
            await chrome.storage.local.remove('authToken');
            return { loggedIn: false };
        }
    } catch (error) {
        return { loggedIn: false, error: '無法連線' };
    }
}

/**
 * 清除 Dcard 相關 cookies（排解 Cloudflare 503 封鎖）
 * 清除 Cloudflare bot detection cookies，讓 session 重置
 */
async function clearDcardCookies() {
    try {
        const cookies = await chrome.cookies.getAll({ domain: '.dcard.tw' });
        let cleared = 0;
        for (const cookie of cookies) {
            const url = `https://${cookie.domain.replace(/^\./, '')}${cookie.path}`;
            await chrome.cookies.remove({ url, name: cookie.name });
            cleared++;
        }
        // 也清除 www.dcard.tw 的 cookies
        const wwwCookies = await chrome.cookies.getAll({ domain: 'www.dcard.tw' });
        for (const cookie of wwwCookies) {
            await chrome.cookies.remove({
                url: `https://www.dcard.tw${cookie.path}`,
                name: cookie.name
            });
            cleared++;
        }
        return { success: true, cleared };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// 初始化 badge
chrome.storage.local.get('products').then(({ products = [] }) => {
    if (products.length > 0) {
        chrome.action.setBadgeText({ text: products.length.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' });
    }
});
