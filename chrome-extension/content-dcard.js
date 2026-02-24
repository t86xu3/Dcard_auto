/**
 * Content Script - Dcard 頁面
 * 自動貼文：填標題 + 貼內文 + 圖片工具列
 */

(function () {
    'use strict';

    console.log('📝 Dcard 文章生成器 - Dcard 輔助已載入');

    let pendingArticle = null;
    let imageToolbar = null;

    // 監聽來自 background 的訊息
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        // 舊版：手動複製模式
        if (message.type === 'PASTE_TO_DCARD') {
            pendingArticle = message.data;
            showPasteHelper();
            sendResponse({ success: true });
        }

        // 新版：自動貼上模式
        if (message.type === 'AUTO_PASTE_ARTICLE') {
            pendingArticle = message.data;
            autoPasteArticle(message.data);
            sendResponse({ success: true });
        }

        if (message.type === 'GET_PENDING_ARTICLE') {
            sendResponse({ article: pendingArticle });
        }

        return true;
    });

    // ===== 自動貼上流程 =====

    /**
     * 自動貼上文章：填標題 → 貼內文 → 顯示圖片工具列
     */
    async function autoPasteArticle(articleData) {
        const { title, plain_content, content, image_positions, forum } = articleData;

        // 等待編輯器出現
        const editor = await waitForElement('[data-lexical-editor="true"]', 10000);
        if (!editor) {
            showToast('找不到 Dcard 編輯器，請確認在發文頁面', 'error');
            return;
        }

        let titleOk = false;
        let contentOk = false;

        // 1. 填入標題
        try {
            titleOk = await fillTitle(title);
        } catch (e) {
            console.error('填入標題失敗:', e);
        }

        // 2. 貼上內文
        try {
            // 使用 plain_content（不含圖片標記）或 fallback 到 content
            const textContent = plain_content || content || '';
            contentOk = await pasteContent(editor, textContent);
        } catch (e) {
            console.error('貼上內文失敗:', e);
        }

        // 3. 顯示結果 + 圖片工具列
        if (titleOk || contentOk) {
            showImageToolbar(articleData);
        } else {
            // 自動貼上完全失敗，fallback 到手動複製模式
            showPasteHelper();
            showToast('自動貼上失敗，請手動複製', 'error');
        }
    }

    /**
     * 等待 DOM 元素出現
     */
    function waitForElement(selector, timeout = 5000) {
        return new Promise((resolve) => {
            const el = document.querySelector(selector);
            if (el) return resolve(el);

            const observer = new MutationObserver(() => {
                const el = document.querySelector(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });
            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, timeout);
        });
    }

    /**
     * 自動填入標題（React controlled textarea）
     */
    async function fillTitle(title) {
        const textarea = document.querySelector('textarea[name="title"]');
        if (!textarea) {
            console.warn('找不到標題 textarea');
            return false;
        }

        // React controlled input 需要用 native setter
        const nativeSetter = Object.getOwnPropertyDescriptor(
            HTMLTextAreaElement.prototype, 'value'
        ).set;
        nativeSetter.call(textarea, title);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
    }

    /**
     * 自動貼上內文到 Lexical 編輯器
     */
    async function pasteContent(editor, text) {
        editor.focus();

        // 短暫延遲確保 focus 生效
        await new Promise(r => setTimeout(r, 200));

        // 方法 1：合成 ClipboardEvent
        try {
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dt
            });
            const dispatched = editor.dispatchEvent(pasteEvent);
            if (dispatched) {
                // 驗證內容是否貼上（等一下再檢查）
                await new Promise(r => setTimeout(r, 500));
                if (editor.textContent && editor.textContent.length > 10) {
                    return true;
                }
            }
        } catch (e) {
            console.warn('ClipboardEvent 方法失敗:', e);
        }

        // 方法 2：document.execCommand('insertText')
        try {
            editor.focus();
            await new Promise(r => setTimeout(r, 100));
            const result = document.execCommand('insertText', false, text);
            if (result) {
                await new Promise(r => setTimeout(r, 300));
                if (editor.textContent && editor.textContent.length > 10) {
                    return true;
                }
            }
        } catch (e) {
            console.warn('execCommand 方法失敗:', e);
        }

        // 方法 3：寫入剪貼簿後提示手動 Ctrl+V
        try {
            await navigator.clipboard.writeText(text);
            showToast('已複製到剪貼簿，請按 Ctrl+V 貼上內文');
            return false;
        } catch (e) {
            console.error('所有貼上方法均失敗');
            return false;
        }
    }

    // ===== 圖片工具列 =====

    /**
     * 顯示圖片插入工具列
     */
    function showImageToolbar(articleData) {
        // 移除舊的
        if (imageToolbar) imageToolbar.remove();

        const { title, image_positions } = articleData;
        const hasImages = image_positions && image_positions.length > 0;

        const toolbar = document.createElement('div');
        toolbar.id = 'dcard-image-toolbar';
        toolbar.innerHTML = `
            <div style="
                position: fixed; bottom: 24px; right: 24px;
                background: white; border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                z-index: 999999; font-size: 14px;
                max-width: 400px; min-width: 320px;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                border: 1px solid #e5e7eb;
                overflow: hidden;
            ">
                <!-- Header -->
                <div style="
                    background: linear-gradient(135deg, #10B981 0%, #3B82F6 100%);
                    color: white; padding: 14px 16px;
                    display: flex; justify-content: space-between; align-items: center;
                ">
                    <div>
                        <div style="font-weight: 700; font-size: 14px;">✅ 已貼上文章！</div>
                        <div style="font-size: 12px; opacity: 0.9; margin-top: 3px;
                            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 300px;">
                            ${escapeHtml(title)}
                        </div>
                    </div>
                    <button id="dcard-toolbar-close" style="
                        background: rgba(255,255,255,0.2); border: none; color: white;
                        width: 28px; height: 28px; border-radius: 8px;
                        font-size: 14px; cursor: pointer; display: flex;
                        align-items: center; justify-content: center;
                    ">✕</button>
                </div>

                ${hasImages ? `
                <!-- Image buttons -->
                <div style="padding: 12px 16px;">
                    <div style="font-size: 12px; color: #6b7280; margin-bottom: 10px;">
                        在編輯器中點擊圖片位置，再按對應按鈕插入：
                    </div>
                    <div id="dcard-image-buttons" style="
                        display: flex; flex-wrap: wrap; gap: 8px;
                    ">
                        ${image_positions.map((img, i) => `
                            <button class="dcard-img-btn" data-index="${i}" data-url="${escapeHtml(img.url)}" style="
                                display: flex; align-items: center; gap: 6px;
                                padding: 8px 12px; border: 1px solid #e5e7eb;
                                border-radius: 10px; background: #f9fafb;
                                cursor: pointer; font-size: 12px; font-weight: 500;
                                color: #374151; transition: all 0.15s;
                            " onmouseover="this.style.borderColor='#3B82F6';this.style.background='#EFF6FF'"
                               onmouseout="this.style.borderColor='#e5e7eb';this.style.background='#f9fafb'">
                                <img src="${escapeHtml(img.url)}" style="
                                    width: 32px; height: 32px; object-fit: cover;
                                    border-radius: 6px; border: 1px solid #e5e7eb;
                                " onerror="this.style.display='none'" />
                                <span>📷 ${i + 1}</span>
                            </button>
                        `).join('')}
                    </div>
                    <div style="font-size: 11px; color: #9ca3af; margin-top: 10px;">
                        💡 文中 📷 標記 = 建議圖片位置
                    </div>
                </div>
                ` : `
                <div style="padding: 12px 16px; font-size: 12px; color: #6b7280;">
                    此文章沒有圖片需要插入
                </div>
                `}
            </div>
        `;

        document.body.appendChild(toolbar);
        imageToolbar = toolbar;

        // 關閉按鈕
        document.getElementById('dcard-toolbar-close').addEventListener('click', () => {
            toolbar.remove();
            imageToolbar = null;
        });

        // 圖片按鈕事件
        if (hasImages) {
            toolbar.querySelectorAll('.dcard-img-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const url = btn.dataset.url;
                    const index = btn.dataset.index;

                    // 防止重複點擊
                    if (btn.disabled) return;
                    btn.disabled = true;
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = '<span style="color:#6b7280">⏳ 插入中...</span>';

                    const ok = await insertImage(url);

                    if (ok) {
                        btn.innerHTML = '<span style="color:#10B981">✅ 已插入</span>';
                        btn.style.borderColor = '#10B981';
                        btn.style.background = '#ECFDF5';
                        btn.style.cursor = 'default';
                    } else {
                        btn.innerHTML = originalHtml;
                        btn.disabled = false;
                        showToast('圖片插入失敗，請手動上傳', 'error');
                    }
                });
            });
        }
    }

    /**
     * 插入圖片到 Dcard 編輯器
     * 透過 background.js 下載 → 建立 File → 設定到 #editor-image → 觸發 change
     */
    async function insertImage(imageUrl) {
        try {
            // 1. 透過 background.js 下載圖片（避免 CORS）
            const result = await chrome.runtime.sendMessage({
                type: 'FETCH_IMAGE_BLOB',
                url: imageUrl
            });

            if (!result || !result.success) {
                console.error('圖片下載失敗:', result?.error);
                return false;
            }

            // 2. dataUrl → blob → File
            const resp = await fetch(result.dataUrl);
            const blob = await resp.blob();
            const ext = (result.type || 'image/jpeg').split('/')[1] || 'jpg';
            const file = new File([blob], `product-image.${ext}`, {
                type: result.type || 'image/jpeg'
            });

            // 3. 找到 Dcard 的隱藏 file input
            const fileInput = document.querySelector('#editor-image')
                || document.querySelector('input[type="file"][accept*="image"]');

            if (!fileInput) {
                console.error('找不到 #editor-image file input');
                return false;
            }

            // 4. 設定 file 並觸發 change event
            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;

            // 用 React native setter pattern 確保事件被接收
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            fileInput.dispatchEvent(new Event('input', { bubbles: true }));

            // 等待圖片上傳處理
            await new Promise(r => setTimeout(r, 1000));

            return true;
        } catch (error) {
            console.error('插入圖片失敗:', error);
            return false;
        }
    }

    // ===== 手動複製模式（舊版 fallback）=====

    /**
     * 顯示手動複製輔助浮動按鈕
     */
    function showPasteHelper() {
        // 移除舊的
        const old = document.getElementById('dcard-paste-helper');
        if (old) old.remove();

        if (!pendingArticle) return;

        const helper = document.createElement('div');
        helper.id = 'dcard-paste-helper';
        helper.innerHTML = `
            <div style="
                position: fixed; bottom: 24px; right: 24px;
                background: linear-gradient(135deg, #3B82F6 0%, #6366F1 100%);
                color: white; padding: 16px 20px; border-radius: 16px;
                box-shadow: 0 8px 32px rgba(59, 130, 246, 0.4);
                z-index: 999999; font-size: 14px; max-width: 320px;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                cursor: default;
            ">
                <div style="font-weight: 700; margin-bottom: 8px;">📝 文章已就緒</div>
                <div style="font-size: 12px; opacity: 0.9; margin-bottom: 12px;
                    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${escapeHtml(pendingArticle.title)}
                </div>
                <div style="display: flex; gap: 8px;">
                    <button id="dcard-auto-paste" style="
                        flex: 1; padding: 8px; border: none; border-radius: 8px;
                        background: rgba(255,255,255,0.3); color: white;
                        font-size: 12px; font-weight: 600; cursor: pointer;
                    ">🚀 自動貼上</button>
                    <button id="dcard-copy-title" style="
                        flex: 1; padding: 8px; border: none; border-radius: 8px;
                        background: rgba(255,255,255,0.2); color: white;
                        font-size: 12px; font-weight: 600; cursor: pointer;
                    ">複製標題</button>
                    <button id="dcard-copy-content" style="
                        flex: 1; padding: 8px; border: none; border-radius: 8px;
                        background: rgba(255,255,255,0.2); color: white;
                        font-size: 12px; font-weight: 600; cursor: pointer;
                    ">複製內容</button>
                    <button id="dcard-dismiss" style="
                        padding: 8px; border: none; border-radius: 8px;
                        background: rgba(255,255,255,0.1); color: white;
                        font-size: 12px; cursor: pointer;
                    ">✕</button>
                </div>
                <div style="font-size: 11px; opacity: 0.7; margin-top: 8px;">
                    點「自動貼上」或手動複製標題和內容
                </div>
            </div>
        `;

        document.body.appendChild(helper);

        // 自動貼上
        document.getElementById('dcard-auto-paste').addEventListener('click', async () => {
            helper.remove();
            await autoPasteArticle(pendingArticle);
        });

        // 複製標題
        document.getElementById('dcard-copy-title').addEventListener('click', async () => {
            await copyToClipboard(pendingArticle.title);
            showToast('已複製標題');
        });

        // 複製內容
        document.getElementById('dcard-copy-content').addEventListener('click', async () => {
            await copyToClipboard(pendingArticle.plain_content || pendingArticle.content);
            showToast('已複製內容');
        });

        // 關閉
        document.getElementById('dcard-dismiss').addEventListener('click', () => {
            helper.remove();
            pendingArticle = null;
        });
    }

    // ===== 工具函數 =====

    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    async function copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.cssText = 'position:fixed;opacity:0;';
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            textarea.remove();
        }
    }

    function showToast(message, type = 'info') {
        const colors = {
            info: '#1F2937',
            error: '#DC2626',
            success: '#059669'
        };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 100px; left: 50%;
            transform: translateX(-50%); background: ${colors[type] || colors.info};
            color: white; padding: 10px 20px; border-radius: 8px;
            font-size: 13px; z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
        `;
        toast.textContent = message;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // ===== 編輯器偵測（保留，自動顯示 pending 文章）=====

    function checkForEditor() {
        if (!location.href.includes('dcard.tw')) return;

        // 如果有 pending 文章且在發文頁面，顯示輔助
        if (pendingArticle && location.href.includes('/new')) {
            showPasteHelper();
        }
    }

    // 頁面載入後檢查
    setTimeout(checkForEditor, 2000);
})();
