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
    const generateBtn = document.getElementById('generateBtn');
    const generateHint = document.getElementById('generateHint');
    const articleList = document.getElementById('articleList');

    // Tab 切換
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add('active');

            if (tab.dataset.tab === 'articles') {
                loadArticles();
            }
        });
    });

    await loadProducts();

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
        if (!confirm('確定要清除所有已擷取的商品嗎？')) return;
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

    // 生成文章
    generateBtn.addEventListener('click', async () => {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="btn-icon">⏳</span> 生成中...';

        try {
            // 先同步到後端取得 DB ID
            const syncResponse = await chrome.runtime.sendMessage({ type: 'SYNC_ALL_TO_BACKEND' });

            // 取得後端商品列表以獲得 ID
            const productsResponse = await fetch('http://localhost:8001/api/products');
            const products = await productsResponse.json();

            if (products.length < 1) {
                generateHint.textContent = '❌ 後端沒有商品，請先同步';
                generateHint.style.color = '#EF4444';
            } else {
                const productIds = products.slice(0, 5).map(p => p.id);

                const response = await chrome.runtime.sendMessage({
                    type: 'GENERATE_ARTICLE',
                    data: {
                        product_ids: productIds,
                        article_type: products.length >= 2 ? 'comparison' : 'review',
                        target_forum: 'goodthings'
                    }
                });

                if (response && response.success) {
                    generateHint.textContent = '✅ 文章已生成！';
                    generateHint.style.color = '#10B981';
                    showToast('✅ 文章已生成');
                    // 切到文章 Tab
                    document.querySelectorAll('.tab')[1].click();
                } else {
                    generateHint.textContent = `❌ ${response?.error || '生成失敗'}`;
                    generateHint.style.color = '#EF4444';
                }
            }
        } catch (error) {
            generateHint.textContent = '❌ 請確認後端已啟動';
            generateHint.style.color = '#EF4444';
        }

        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span class="btn-icon">✨</span> 生成比較文';
    });

    /**
     * 載入商品列表
     */
    async function loadProducts() {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PRODUCTS' });
        const products = response.products || [];

        productCount.textContent = products.length;
        generateBtn.disabled = products.length < 1;

        if (products.length >= 2) {
            generateHint.textContent = `已有 ${products.length} 個商品，可生成比較文`;
            generateHint.style.color = '#10B981';
        } else if (products.length === 1) {
            generateHint.textContent = '已有 1 個商品，可生成開箱文';
            generateHint.style.color = '#3B82F6';
        }

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

    /**
     * 載入文章列表
     */
    async function loadArticles() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_ARTICLES' });

            if (!response || !response.success || !response.articles?.length) {
                articleList.innerHTML = `
                    <div class="empty-state">
                        <span class="empty-icon">📄</span>
                        <p>尚未生成文章</p>
                        <small>擷取商品後可生成比較文</small>
                    </div>
                `;
                return;
            }

            articleList.innerHTML = response.articles.map(article => `
                <div class="article-item" data-id="${article.id}">
                    <div class="article-title">${escapeHtml(article.title)}</div>
                    <div class="article-meta">
                        ${article.article_type} · ${article.status} · ${new Date(article.created_at).toLocaleDateString('zh-TW')}
                    </div>
                </div>
            `).join('');

            // 點擊文章 → 開啟 Web UI
            articleList.querySelectorAll('.article-item').forEach(item => {
                item.addEventListener('click', () => {
                    chrome.tabs.create({ url: `http://localhost:3001/articles` });
                });
            });
        } catch (error) {
            articleList.innerHTML = `
                <div class="empty-state">
                    <span class="empty-icon">⚠️</span>
                    <p>無法載入文章</p>
                    <small>請確認後端已啟動</small>
                </div>
            `;
        }
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
