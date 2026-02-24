/**
 * Popup Script - Dcard 文章生成器
 */

document.addEventListener('DOMContentLoaded', async () => {
    const productList = document.getElementById('productList');
    const productCount = document.getElementById('productCount');
    const captureBtn = document.getElementById('captureBtn');
    const captureHint = document.getElementById('captureHint');
    const clearBtn = document.getElementById('clearBtn');
    const syncBtn = document.getElementById('syncBtn');
    const loginSection = document.getElementById('loginSection');
    const mainContent = document.getElementById('mainContent');
    const authStatusBtn = document.getElementById('authStatusBtn');
    const loginBtn = document.getElementById('loginBtn');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginError = document.getElementById('loginError');

    const clearDcardCookiesBtn = document.getElementById('clearDcardCookiesBtn');

    // 顯示版本號
    const manifest = chrome.runtime.getManifest();
    document.getElementById('versionText').textContent = `v${manifest.version}`;

    // === 認證邏輯 ===

    async function checkAuth() {
        const result = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATUS' });
        if (result.loggedIn) {
            showMainContent(result.username);
        } else {
            showLoginSection();
        }
    }

    function showMainContent(username) {
        loginSection.style.display = 'none';
        mainContent.style.display = 'block';
        authStatusBtn.textContent = '👤';
        authStatusBtn.className = 'auth-status-btn logged-in';
        authStatusBtn.title = `${username}（點擊登出）`;
        loadProducts();
    }

    function showLoginSection() {
        loginSection.style.display = 'block';
        mainContent.style.display = 'none';
        authStatusBtn.textContent = '🔒';
        authStatusBtn.className = 'auth-status-btn logged-out';
        authStatusBtn.title = '未登入';
    }

    // 登入
    loginBtn.addEventListener('click', async () => {
        const username = loginUsername.value.trim();
        const password = loginPassword.value.trim();
        loginError.textContent = '';

        if (!username || !password) {
            loginError.textContent = '請輸入帳號和密碼';
            return;
        }

        loginBtn.disabled = true;
        loginBtn.textContent = '登入中...';

        const result = await chrome.runtime.sendMessage({
            type: 'LOGIN',
            username,
            password
        });

        if (result.success) {
            showToast(`✅ 歡迎，${result.username}`);
            showMainContent(result.username);
            loginPassword.value = '';
        } else {
            loginError.textContent = result.error;
        }

        loginBtn.disabled = false;
        loginBtn.textContent = '登入';
    });

    // Enter 鍵登入
    loginPassword.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginBtn.click();
    });
    loginUsername.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') loginPassword.focus();
    });

    // 登出
    authStatusBtn.addEventListener('click', async () => {
        if (authStatusBtn.classList.contains('logged-in')) {
            if (!confirm('確定要登出嗎？')) return;
            await chrome.runtime.sendMessage({ type: 'LOGOUT' });
            showLoginSection();
            showToast('已登出');
        }
    });

    // 初始化：檢查登入狀態
    await checkAuth();

    // 擷取當前商品
    captureBtn.addEventListener('click', async () => {
        captureBtn.disabled = true;
        captureBtn.innerHTML = '<span class="btn-icon">⏳</span> 擷取中...';

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            if (!tab.url.includes('shopee.tw')) {
                captureHint.textContent = '❌ 請在蝦皮頁面使用';
                captureHint.style.color = '#EF4444';
            } else if (!tab.url.includes('/product/') && !tab.url.match(/-i\.\d+\.\d+/)) {
                captureHint.textContent = '❌ 請在商品詳情頁使用';
                captureHint.style.color = '#EF4444';
            } else {
                const response = await chrome.tabs.sendMessage(tab.id, { type: 'CAPTURE_PRODUCT' });

                if (response && response.success) {
                    captureHint.textContent = '✅ 已擷取商品';
                    captureHint.style.color = '#10B981';
                    await loadProducts();
                } else {
                    captureHint.textContent = '❌ 擷取失敗，請重新整理頁面';
                    captureHint.style.color = '#EF4444';
                }
            }
        } catch (error) {
            captureHint.textContent = '❌ 請先重新整理商品頁面';
            captureHint.style.color = '#EF4444';
        }

        captureBtn.disabled = false;
        captureBtn.innerHTML = '<span class="btn-icon">📸</span> 擷取當前商品';

        setTimeout(() => {
            captureHint.textContent = '在蝦皮商品頁面點擊擷取';
            captureHint.style.color = '#94A3B8';
        }, 3000);
    });

    // 清除全部
    clearBtn.addEventListener('click', async () => {
        await chrome.runtime.sendMessage({ type: 'CLEAR_PRODUCTS' });
        await loadProducts();
        showToast('🗑️ 已清除所有商品');
    });

    // 同步到後端
    syncBtn.addEventListener('click', async () => {
        syncBtn.disabled = true;
        syncBtn.innerHTML = '<span class="btn-icon">⏳</span> 同步中...';

        try {
            const response = await chrome.runtime.sendMessage({ type: 'SYNC_ALL_TO_BACKEND' });

            if (response && response.success) {
                if (response.synced > 0) {
                    showToast(`✅ 已同步 ${response.synced} 筆商品`);
                } else if (response.skipped > 0) {
                    showToast(`⏭️ ${response.skipped} 筆商品已存在`);
                } else {
                    showToast('ℹ️ 沒有新商品需要同步');
                }
            } else {
                showToast(`❌ ${response?.error || '同步失敗'}`);
            }
        } catch (error) {
            showToast('❌ 同步失敗：請確認後端已啟動');
        }

        syncBtn.disabled = false;
        syncBtn.innerHTML = '<span class="btn-icon">🔄</span> 同步到後端';
    });

    // 清除 Dcard Cookie（排解 Cloudflare 封鎖）
    clearDcardCookiesBtn.addEventListener('click', async () => {
        clearDcardCookiesBtn.disabled = true;
        clearDcardCookiesBtn.innerHTML = '<span class="btn-icon">⏳</span> 清除中...';

        const result = await chrome.runtime.sendMessage({ type: 'CLEAR_DCARD_COOKIES' });

        if (result.success) {
            showToast(`🍪 已清除 ${result.cleared} 個 Dcard Cookie，請重新整理 Dcard 頁面`);
        } else {
            showToast(`❌ 清除失敗: ${result.error}`);
        }

        clearDcardCookiesBtn.disabled = false;
        clearDcardCookiesBtn.innerHTML = '<span class="btn-icon">🍪</span> 清除 Dcard Cookie';
    });

    /**
     * 載入商品列表
     */
    async function loadProducts() {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PRODUCTS' });
        const products = response.products || [];

        productCount.textContent = products.length;

        if (products.length === 0) {
            productList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">📦</span>
                    <p>尚未擷取任何商品</p>
                    <small>前往蝦皮商品頁面點擊擷取</small>
                </div>
            `;
            clearBtn.disabled = true;
            return;
        }

        clearBtn.disabled = false;
        const sortedProducts = [...products].reverse();

        productList.innerHTML = sortedProducts.map(product => `
            <div class="product-item" data-url="${product.url}" data-itemid="${product.itemid}">
                <img class="product-image"
                     src="${product.images?.[0] || ''}"
                     alt="${escapeHtml(product.name)}"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 50 50%22><rect fill=%22%23F1F5F9%22 width=%2250%22 height=%2250%22/><text x=%2225%22 y=%2230%22 text-anchor=%22middle%22 fill=%22%2394A3B8%22 font-size=%2216%22>📷</text></svg>'">
                <div class="product-info">
                    <div class="product-name">${escapeHtml(product.name)}</div>
                    <div class="product-meta">
                        <span class="product-price">$${formatNumber(product.price)}</span>
                        ${product.rating ? `<span class="product-rating">⭐ ${product.rating.toFixed(1)}</span>` : ''}
                    </div>
                </div>
                <button class="delete-btn" data-itemid="${product.itemid}" title="刪除">✕</button>
            </div>
        `).join('');

        // 點擊開啟連結
        productList.querySelectorAll('.product-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.classList.contains('delete-btn')) return;
                chrome.tabs.create({ url: item.dataset.url });
            });
        });

        // 刪除按鈕
        productList.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const itemid = btn.dataset.itemid;
                const productItem = btn.closest('.product-item');
                productItem.style.opacity = '0.5';

                const response = await chrome.runtime.sendMessage({
                    type: 'DELETE_PRODUCT',
                    itemid: parseInt(itemid) || itemid
                });

                if (response && response.success) {
                    await loadProducts();
                    showToast('🗑️ 已刪除商品');
                } else {
                    productItem.style.opacity = '1';
                }
            });
        });
    }

    function showToast(message) {
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function formatNumber(num) {
        if (!num) return '0';
        if (num >= 10000) return (num / 10000).toFixed(1) + '萬';
        return num.toLocaleString();
    }
});
