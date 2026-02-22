/**
 * Background Service Worker
 * 資料處理、儲存、後端同步
 */

// API 端點設定
const API_BASE_URL = 'https://dcard-auto.web.app/api';
let authToken = null;

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

// 外部訊息監聽（Web UI 偵測用）
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    if (message.type === 'PING') {
        sendResponse({
            type: 'PONG',
            version: chrome.runtime.getManifest().version,
            name: chrome.runtime.getManifest().name
        });
    }
    return true;
});

// 內部訊息監聽
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'PRODUCT_DATA') {
        handleProductData(message.data);
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
 * 貼到 Dcard 活動頁籤
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

// 初始化 badge
chrome.storage.local.get('products').then(({ products = [] }) => {
    if (products.length > 0) {
        chrome.action.setBadgeText({ text: products.length.toString() });
        chrome.action.setBadgeBackgroundColor({ color: '#3B82F6' });
    }
});
