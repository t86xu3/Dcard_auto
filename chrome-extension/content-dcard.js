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
     * 自動貼上文章：填標題 → 逐段建構內容（文字+圖片交替插入）
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

        // 1. 填入標題
        try {
            titleOk = await fillTitle(title);
        } catch (e) {
            console.error('填入標題失敗:', e);
        }

        // 2. 內容 + 圖片
        if (hasImages && paste_content) {
            // 逐段建構：文字段 → 圖片 → 文字段 → 圖片 → ...
            // file input 上傳的圖片會附加在末端，配合逐段建構，位置自然正確
            showProgressPanel(title, image_positions.length);
            const { successImages, failImages } = await pasteContentWithImages(
                editor, paste_content, image_positions
            );
            removeProgressPanel();

            if (successImages > 0 || titleOk) {
                showToast(`✅ 文章已貼上！成功插入 ${successImages} 張圖片` +
                    (failImages > 0 ? `，${failImages} 張失敗` : ''), 'success');
            } else {
                showToast('部分內容插入失敗', 'error');
            }
        } else {
            // 無圖片，直接貼純文字
            const textToPaste = plain_content || content || '';
            let contentOk = false;
            try {
                contentOk = await pasteContent(editor, textToPaste);
            } catch (e) {
                console.error('貼上內文失敗:', e);
            }

            if (titleOk || contentOk) {
                showToast('✅ 文章已貼上！', 'success');
            } else {
                showPasteHelper();
                showToast('自動貼上失敗，請手動複製', 'error');
            }
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

    // ===== 逐段建構（文字+圖片交替插入）=====

    /**
     * 隨機延遲（模擬人類操作節奏）
     */
    function randomDelay(min, max) {
        const ms = Math.floor(Math.random() * (max - min + 1)) + min;
        return new Promise(r => setTimeout(r, ms));
    }

    /**
     * 將游標移到編輯器最末端
     */
    function moveCursorToEnd(editor) {
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false); // collapse to end
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * 在編輯器末端貼上一段文字（ClipboardEvent）
     */
    async function pasteTextSegment(editor, text) {
        if (!text.trim()) return true;

        editor.focus();
        moveCursorToEnd(editor);
        await randomDelay(150, 400);

        const dt = new DataTransfer();
        dt.setData('text/plain', text);
        const pasteEvent = new ClipboardEvent('paste', {
            bubbles: true,
            cancelable: true,
            clipboardData: dt,
        });
        editor.dispatchEvent(pasteEvent);

        // 等待 Lexical 渲染
        await randomDelay(800, 1500);
        return true;
    }

    /**
     * 透過 file input 上傳圖片（Dcard 編輯器會附加在最末端）
     */
    async function uploadImageViaFileInput(imageUrl) {
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

            // 2. dataUrl → File
            const resp = await fetch(result.dataUrl);
            const blob = await resp.blob();
            const mimeType = result.type || 'image/jpeg';
            const ext = mimeType.split('/')[1] || 'jpg';
            const file = new File([blob], `product-image-${Date.now()}.${ext}`, { type: mimeType });

            // 3. file input 上傳
            const fileInput = document.querySelector('#editor-image')
                || document.querySelector('input[type="file"][accept*="image"]');

            if (!fileInput) {
                console.error('找不到圖片上傳 input');
                return false;
            }

            const dt = new DataTransfer();
            dt.items.add(file);
            fileInput.files = dt.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
        } catch (error) {
            console.error('上傳圖片失敗:', error);
            return false;
        }
    }

    /**
     * 按順序逐段建構文章：文字段 → 圖片 → 文字段 → 圖片 → ...
     * 核心原理：file input 上傳的圖片會附加在編輯器末端，
     * 而我們從頭到尾逐段建構，所以「末端」就是正確的位置。
     */
    async function pasteContentWithImages(editor, pasteContent, imagePositions) {
        // 建立 index → image 對照表
        const imageMap = {};
        for (const img of imagePositions) {
            imageMap[img.index] = img;
        }

        // 用 📷圖N 分割內容（capturing group 保留分隔符）
        const segments = pasteContent.split(/(📷圖\d+)/);

        let successImages = 0;
        let failImages = 0;
        let imageCount = 0;
        const totalImages = imagePositions.length;

        for (const segment of segments) {
            const markerMatch = segment.match(/^📷圖(\d+)$/);

            if (markerMatch) {
                // 圖片標記 → 上傳圖片
                const idx = parseInt(markerMatch[1]);
                const img = imageMap[idx];
                if (img) {
                    imageCount++;
                    updateProgressPanel(imageCount, totalImages);
                    const ok = await uploadImageViaFileInput(img.url);
                    if (ok) {
                        successImages++;
                        // 等待 Dcard 處理圖片上傳
                        await randomDelay(2000, 3500);
                    } else {
                        failImages++;
                    }
                }
            } else if (segment.trim()) {
                // 文字段 → 貼在編輯器末端
                await pasteTextSegment(editor, segment);
            }
        }

        return { successImages, failImages };
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
