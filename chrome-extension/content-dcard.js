/**
 * Content Script - Dcard 頁面
 * 全自動貼文：填標題 + 貼內文 + 自動插入圖片
 */

(function () {
    'use strict';

    console.log('📝 Dcard 文章生成器 - Dcard 輔助已載入');

    let pendingArticle = null;

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
     * 自動貼上文章：填標題 → 貼內文（含圖片標記）→ 自動逐張插入圖片
     */
    async function autoPasteArticle(articleData) {
        const { title, paste_content, plain_content, content, image_positions } = articleData;
        const hasImages = image_positions && image_positions.length > 0;

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
        // 有圖片時用 paste_content（含 📷圖N 標記），無圖片時用 plain_content
        const textToPaste = hasImages
            ? (paste_content || plain_content || content || '')
            : (plain_content || content || '');

        try {
            contentOk = await pasteContent(editor, textToPaste);
        } catch (e) {
            console.error('貼上內文失敗:', e);
        }

        // 3. 自動插入圖片
        if (contentOk && hasImages) {
            showProgressPanel(title, image_positions.length);
            await autoInsertImages(editor, image_positions);
        } else if (titleOk || contentOk) {
            showToast('✅ 文章已貼上！', 'success');
        } else {
            // 全部失敗，fallback 到手動複製
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
     * 只使用 ClipboardEvent（Lexical 原生處理），不 fallback execCommand 避免重複
     */
    async function pasteContent(editor, text) {
        const beforeLen = (editor.textContent || '').length;

        editor.focus();
        await new Promise(r => setTimeout(r, 300));

        // 合成 ClipboardEvent — Lexical 會攔截並自行處理
        try {
            const dt = new DataTransfer();
            dt.setData('text/plain', text);
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dt
            });
            editor.dispatchEvent(pasteEvent);

            // 等待 Lexical 渲染完成
            await new Promise(r => setTimeout(r, 1500));
            const afterLen = (editor.textContent || '').length;
            if (afterLen > beforeLen + 10) {
                return true;
            }
        } catch (e) {
            console.warn('ClipboardEvent 失敗:', e);
        }

        // ClipboardEvent 失敗 → 寫入剪貼簿讓使用者手動 Ctrl+V
        try {
            await navigator.clipboard.writeText(text);
            showToast('請按 Ctrl+V 貼上內文（自動貼上未生效）');
            // 等使用者貼上
            await waitForEditorContent(editor, beforeLen, 30000);
            return (editor.textContent || '').length > beforeLen + 10;
        } catch (e) {
            console.error('剪貼簿寫入也失敗:', e);
            return false;
        }
    }

    /**
     * 等待編輯器內容出現（使用者手動 Ctrl+V 時）
     */
    function waitForEditorContent(editor, minLen, timeout) {
        return new Promise((resolve) => {
            const check = setInterval(() => {
                if ((editor.textContent || '').length > minLen + 10) {
                    clearInterval(check);
                    resolve(true);
                }
            }, 500);
            setTimeout(() => { clearInterval(check); resolve(false); }, timeout);
        });
    }

    // ===== 自動圖片插入 =====

    /**
     * 在編輯器中找到文字節點
     */
    function findTextInEditor(editor, searchText) {
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
            const node = walker.currentNode;
            const idx = node.textContent.indexOf(searchText);
            if (idx !== -1) {
                return { node, offset: idx };
            }
        }
        return null;
    }

    /**
     * 選取並刪除編輯器中的標記文字，將游標定位到該位置
     */
    function selectAndDeleteMarker(editor, markerText) {
        const found = findTextInEditor(editor, markerText);
        if (!found) return false;

        const range = document.createRange();
        range.setStart(found.node, found.offset);
        range.setEnd(found.node, found.offset + markerText.length);

        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);

        // 刪除選取的標記文字
        document.execCommand('delete');
        return true;
    }

    /**
     * 自動逐張插入圖片：找到 📷圖N 標記 → 定位游標 → 插入圖片
     */
    async function autoInsertImages(editor, imagePositions) {
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < imagePositions.length; i++) {
            const img = imagePositions[i];
            const markerText = `📷圖${img.index || (i + 1)}`;

            updateProgressPanel(i + 1, imagePositions.length);

            // 1. 找到並刪除標記，游標定位到該位置
            const found = selectAndDeleteMarker(editor, markerText);
            if (!found) {
                console.warn(`找不到標記: ${markerText}`);
                failCount++;
                continue;
            }

            // 2. 在游標位置插入圖片
            await new Promise(r => setTimeout(r, 300));
            const ok = await insertImageFile(img.url);

            if (ok) {
                successCount++;
                // 等待 Dcard 處理圖片上傳
                await new Promise(r => setTimeout(r, 2000));
            } else {
                failCount++;
            }
        }

        // 完成
        removeProgressPanel();
        if (successCount > 0) {
            showToast(`✅ 文章已貼上！成功插入 ${successCount} 張圖片` +
                (failCount > 0 ? `，${failCount} 張失敗` : ''), 'success');
        } else if (failCount > 0) {
            showToast(`圖片插入失敗（${failCount} 張），請手動上傳`, 'error');
        }
    }

    /**
     * 在游標位置插入圖片（優先用 paste event，fallback 到 file input）
     */
    async function insertImageFile(imageUrl) {
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
            const mimeType = result.type || 'image/jpeg';
            const ext = mimeType.split('/')[1] || 'jpg';
            const file = new File([blob], `product-image-${Date.now()}.${ext}`, { type: mimeType });

            // 3. 嘗試 paste event（會在游標位置插入）
            const editor = document.querySelector('[data-lexical-editor="true"]');
            if (editor) {
                try {
                    editor.focus();
                    const dt = new DataTransfer();
                    dt.items.add(file);
                    const pasteEvent = new ClipboardEvent('paste', {
                        bubbles: true,
                        cancelable: true,
                        clipboardData: dt,
                    });
                    editor.dispatchEvent(pasteEvent);
                    // Lexical 處理 paste 時會呼叫 preventDefault()
                    if (pasteEvent.defaultPrevented) {
                        return true;
                    }
                } catch (e) {
                    console.warn('Paste event 插入失敗，fallback 到 file input:', e);
                }
            }

            // 4. Fallback: 用 file input（會在底部插入）
            const fileInput = document.querySelector('#editor-image')
                || document.querySelector('input[type="file"][accept*="image"]');

            if (!fileInput) {
                console.error('找不到圖片上傳 input');
                return false;
            }

            const dt2 = new DataTransfer();
            dt2.items.add(file);
            fileInput.files = dt2.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            return true;
        } catch (error) {
            console.error('插入圖片失敗:', error);
            return false;
        }
    }

    // ===== 進度面板 =====

    function showProgressPanel(title, totalImages) {
        removeProgressPanel();
        const panel = document.createElement('div');
        panel.id = 'dcard-progress-panel';
        panel.innerHTML = `
            <div style="
                position: fixed; bottom: 24px; right: 24px;
                background: white; border-radius: 16px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.15);
                z-index: 999999; font-size: 14px;
                min-width: 300px; overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                border: 1px solid #e5e7eb;
            ">
                <div style="
                    background: linear-gradient(135deg, #3B82F6 0%, #6366F1 100%);
                    color: white; padding: 14px 16px;
                ">
                    <div style="font-weight: 700;">⏳ 自動插入圖片中...</div>
                    <div style="font-size: 12px; opacity: 0.9; margin-top: 3px;
                        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;">
                        ${escapeHtml(title)}
                    </div>
                </div>
                <div style="padding: 12px 16px;">
                    <div id="dcard-progress-text" style="font-size: 13px; color: #374151; margin-bottom: 8px;">
                        準備中...
                    </div>
                    <div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
                        <div id="dcard-progress-bar" style="
                            height: 100%; background: linear-gradient(90deg, #3B82F6, #6366F1);
                            border-radius: 3px; width: 0%; transition: width 0.3s;
                        "></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(panel);
    }

    function updateProgressPanel(current, total) {
        const text = document.getElementById('dcard-progress-text');
        const bar = document.getElementById('dcard-progress-bar');
        if (text) text.textContent = `插入第 ${current}/${total} 張圖片...`;
        if (bar) bar.style.width = `${(current / total) * 100}%`;
    }

    function removeProgressPanel() {
        const panel = document.getElementById('dcard-progress-panel');
        if (panel) panel.remove();
    }

    // ===== 手動複製模式（fallback）=====

    function showPasteHelper() {
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
            </div>
        `;
        document.body.appendChild(helper);

        document.getElementById('dcard-auto-paste').addEventListener('click', async () => {
            helper.remove();
            await autoPasteArticle(pendingArticle);
        });
        document.getElementById('dcard-copy-title').addEventListener('click', async () => {
            await copyToClipboard(pendingArticle.title);
            showToast('已複製標題');
        });
        document.getElementById('dcard-copy-content').addEventListener('click', async () => {
            await copyToClipboard(pendingArticle.plain_content || pendingArticle.content);
            showToast('已複製內容');
        });
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
        const colors = { info: '#1F2937', error: '#DC2626', success: '#059669' };
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
        setTimeout(() => toast.remove(), 4000);
    }

    // 頁面載入後檢查 pending 文章
    setTimeout(() => {
        if (pendingArticle && location.href.includes('/new')) {
            showPasteHelper();
        }
    }, 2000);
})();
