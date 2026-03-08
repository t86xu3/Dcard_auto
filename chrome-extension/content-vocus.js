/**
 * content-vocus.js — Vocus (方格子) 編輯器偵測 & 自動貼文
 *
 * 執行環境：vocus.cc / creator.vocus.cc 頁面
 * 編輯器框架：Lexical（與 Dcard 相同）
 * 關鍵差異：方格子支援 Markdown / H2 H3 標題 → 自動生成目錄 → SEO 加分
 *          貼文時用 execCommand('insertText') 模擬打字 ## 觸發 Markdown 快捷鍵
 *          圖片採 Dcard 同款逐段建構（text/plain + ClipboardEvent 圖片），確保位置正確
 */

(() => {
  'use strict';

  const LOG_PREFIX = '[Dcard Auto - Vocus]';

  let pendingArticle = null;

  // ── 編輯器偵測 ──

  const EDITOR_SELECTORS = [
    '[data-lexical-editor="true"]',
    '[data-id="editor-content-textarea"]',
    '.ContentEditable__root[contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]',
  ];

  const TITLE_SELECTORS = [
    'textarea[name="title"]',
    'input[name="title"]',
    'textarea[placeholder*="標題"]',
    'input[placeholder*="標題"]',
    '[data-placeholder*="標題"]',
    'textarea[placeholder*="輸入標題"]',
    'input[placeholder*="Title"]',
    // Vocus 可能用 contenteditable 做標題
    'h1[contenteditable="true"]',
    '.article-title textarea',
    '.article-title input',
    // 更廣泛的搜尋
    'textarea:first-of-type',
  ];

  // ── 工具函數 ──

  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve) => {
      // 支援多個 selector（用陣列）
      const selectors = Array.isArray(selector) ? selector : [selector];
      const query = () => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el) return el;
        }
        return null;
      };

      const el = query();
      if (el) return resolve(el);

      const observer = new MutationObserver(() => {
        const el = query();
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

  function randomDelay(min, max) {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise((r) => setTimeout(r, ms));
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
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

  // ── Lexical 操作 ──

  function moveCursorToEnd(editor) {
    editor.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'End',
        code: 'End',
        ctrlKey: true,
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  async function reconcileLexicalState(editor) {
    editor.blur();
    await new Promise((r) => setTimeout(r, 500));
    editor.focus();
    await new Promise((r) => setTimeout(r, 500));
  }

  function waitForEditorContent(editor, minLen, timeout) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if ((editor.textContent || '').length > minLen + 10) {
          clearInterval(check);
          resolve(true);
        }
      }, 500);
      setTimeout(() => {
        clearInterval(check);
        resolve(false);
      }, timeout);
    });
  }

  // ── 標題填入 ──

  async function fillTitle(title) {
    // 策略 1：textarea / input
    for (const sel of TITLE_SELECTORS) {
      const el = document.querySelector(sel);
      if (!el) continue;

      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const proto =
          el.tagName === 'TEXTAREA'
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (nativeSetter) {
          nativeSetter.call(el, title);
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`${LOG_PREFIX} 標題已填入 (${sel})`);
          return true;
        }
      }

      // contenteditable 標題
      if (el.contentEditable === 'true') {
        el.focus();
        el.textContent = title;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        console.log(`${LOG_PREFIX} 標題已填入 (contenteditable ${sel})`);
        return true;
      }
    }

    // 策略 2：掃描所有 textarea，找最像標題的
    const allTextareas = document.querySelectorAll('textarea');
    for (const ta of allTextareas) {
      const ph = (ta.placeholder || '').toLowerCase();
      if (ph.includes('標題') || ph.includes('title') || ph.includes('輸入')) {
        const nativeSetter = Object.getOwnPropertyDescriptor(
          HTMLTextAreaElement.prototype,
          'value',
        )?.set;
        if (nativeSetter) {
          nativeSetter.call(ta, title);
          ta.dispatchEvent(new Event('input', { bubbles: true }));
          ta.dispatchEvent(new Event('change', { bubbles: true }));
          console.log(`${LOG_PREFIX} 標題已填入 (掃描到: ${ta.placeholder})`);
          return true;
        }
      }
    }

    console.warn(`${LOG_PREFIX} 找不到標題欄位`);
    return false;
  }

  // ── 內容貼上（使用 Markdown 快捷鍵建立標題）──

  async function pasteContent(editor, content) {
    const beforeLen = (editor.textContent || '').length;

    try {
      // 使用智能貼上：heading 用 Markdown 快捷鍵，其他用 text/plain
      await pasteTextSegment(editor, content);

      await new Promise((r) => setTimeout(r, 1000));
      const afterLen = (editor.textContent || '').length;
      if (afterLen > beforeLen + 10) {
        await reconcileLexicalState(editor);
        console.log(`${LOG_PREFIX} 內容貼上成功（${afterLen - beforeLen} 字）`);
        return true;
      }
    } catch (e) {
      console.warn(`${LOG_PREFIX} pasteContent 失敗:`, e);
    }

    // Fallback: 寫入剪貼簿讓使用者手動 Ctrl+V
    try {
      await navigator.clipboard.writeText(content);
      showToast('請按 Ctrl+V 貼上內文（自動貼上未生效）');
      await waitForEditorContent(editor, beforeLen, 30000);
      return (editor.textContent || '').length > beforeLen + 10;
    } catch (e) {
      console.error(`${LOG_PREFIX} 剪貼簿寫入也失敗:`, e);
      return false;
    }
  }

  // ── 逐段建構（文字+圖片交替插入）──

  /**
   * 用 HTML paste 建立標題（<h2>text</h2>）
   * Lexical 的 $generateNodesFromDOM 會解析 <h2> 標籤建立 HeadingNode
   * 比 execCommand 模擬打字更可靠
   */
  async function typeMarkdownHeading(editor, level, headingText) {
    editor.focus();
    moveCursorToEnd(editor);
    await randomDelay(200, 400);

    const tag = `h${level}`;
    const html = `<${tag}>${escapeHtml(headingText)}</${tag}>`;

    const dt = new DataTransfer();
    dt.setData('text/html', html);
    dt.setData('text/plain', headingText); // fallback
    editor.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      }),
    );
    await randomDelay(500, 800);
  }

  /** 貼上一段 HTML（用於 heading、分隔線等需要特殊格式的元素） */
  async function pasteHtmlFragment(editor, html) {
    editor.focus();
    moveCursorToEnd(editor);
    await randomDelay(200, 400);

    const dt = new DataTransfer();
    dt.setData('text/html', html);
    editor.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      }),
    );
    await randomDelay(400, 600);
  }

  /** 批量貼上一段純文字（不含 heading） */
  async function flushTextBuffer(editor, lines) {
    const text = lines.join('\n');
    if (!text.trim()) return;

    editor.focus();
    moveCursorToEnd(editor);
    await randomDelay(100, 200);

    const dt = new DataTransfer();
    dt.setData('text/plain', text);
    editor.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      }),
    );
    await randomDelay(800, 1200);
  }

  /**
   * 智能貼上文字段：偵測 Markdown heading，用方格子原生快捷鍵建立標題
   * 一般文字用 text/plain 批量貼上（快速且游標定位可靠，與 Dcard 一致）
   */
  async function pasteTextSegment(editor, text) {
    if (!text.trim()) return true;

    const lines = text.split('\n');
    const hasSpecialLines = lines.some(
      (l) => /^#{1,3}\s+.+$/.test(l) || /^(-{3,}|={3,})$/.test(l.trim()),
    );

    if (!hasSpecialLines) {
      // 無標題：直接批量貼上（最快）
      editor.focus();
      moveCursorToEnd(editor);
      await randomDelay(300, 500);

      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      editor.dispatchEvent(
        new ClipboardEvent('paste', {
          bubbles: true,
          cancelable: true,
          clipboardData: dt,
        }),
      );
      await randomDelay(1000, 1800);
      return true;
    }

    // 有標題/分隔線：逐行處理，heading 用 HTML paste，其他批量貼上
    let buffer = [];

    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
      const isSeparator = /^(-{3,}|={3,})$/.test(line.trim());

      if (headingMatch) {
        // 先 flush 累積的普通文字
        if (buffer.length > 0) {
          await flushTextBuffer(editor, buffer);
          buffer = [];
        }
        // 用 HTML paste 建立 heading
        await typeMarkdownHeading(editor, headingMatch[1].length, headingMatch[2]);
      } else if (isSeparator) {
        if (buffer.length > 0) {
          await flushTextBuffer(editor, buffer);
          buffer = [];
        }
        // 用 HTML paste 建立分隔線
        await pasteHtmlFragment(editor, '<hr>');
      } else {
        buffer.push(line);
      }
    }

    // flush 剩餘的普通文字
    if (buffer.length > 0) {
      await flushTextBuffer(editor, buffer);
    }

    return true;
  }

  function waitForImageInEditor(editor, previousImageCount, timeout = 10000) {
    return new Promise((resolve) => {
      const startTime = Date.now();
      const check = setInterval(() => {
        const currentImages = editor.querySelectorAll('img').length;
        if (currentImages > previousImageCount) {
          clearInterval(check);
          resolve(true);
        }
        if (Date.now() - startTime > timeout) {
          clearInterval(check);
          console.warn(`${LOG_PREFIX} 等待圖片出現超時`);
          resolve(false);
        }
      }, 500);
    });
  }

  async function uploadImageViaClipboard(editor, imageUrl) {
    try {
      const beforeImageCount = editor.querySelectorAll('img').length;

      // 透過 background.js 下載圖片（避免 CORS）
      const result = await chrome.runtime.sendMessage({
        type: 'FETCH_IMAGE_BLOB',
        url: imageUrl,
      });

      if (!result || !result.success) {
        console.error(`${LOG_PREFIX} 圖片下載失敗:`, result?.error);
        return false;
      }

      // dataUrl → File
      const resp = await fetch(result.dataUrl);
      const blob = await resp.blob();
      const mimeType = result.type || 'image/jpeg';
      const ext = mimeType.split('/')[1] || 'jpg';
      const file = new File([blob], `product-image-${Date.now()}.${ext}`, {
        type: mimeType,
      });

      // ClipboardEvent 貼上圖片
      editor.focus();
      moveCursorToEnd(editor);
      await randomDelay(300, 600);

      const dt = new DataTransfer();
      dt.items.add(file);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      editor.dispatchEvent(pasteEvent);

      // 等待圖片出現
      const appeared = await waitForImageInEditor(
        editor,
        beforeImageCount,
        15000,
      );
      if (appeared) {
        await randomDelay(2000, 4000);
      } else {
        // Fallback: file input
        console.warn(`${LOG_PREFIX} Clipboard paste 未生效，嘗試 file input`);
        const fileInput = document.querySelector(
          'input[type="file"][accept*="image"]',
        );
        if (fileInput) {
          const fdt = new DataTransfer();
          fdt.items.add(file);
          fileInput.files = fdt.files;
          fileInput.dispatchEvent(new Event('change', { bubbles: true }));
          const ok = await waitForImageInEditor(
            editor,
            beforeImageCount,
            10000,
          );
          if (ok) await randomDelay(1500, 2500);
        }
      }

      return true;
    } catch (error) {
      console.error(`${LOG_PREFIX} 上傳圖片失敗:`, error);
      return false;
    }
  }

  async function pasteContentWithImages(
    editor,
    pasteContent,
    imagePositions,
  ) {
    const imageMap = {};
    for (const img of imagePositions) {
      imageMap[img.index] = img;
    }

    const segments = pasteContent.split(/(📷圖\d+)/);

    let successImages = 0;
    let failImages = 0;
    let imageCount = 0;
    const totalImages = imagePositions.length;

    for (const segment of segments) {
      const markerMatch = segment.match(/^📷圖(\d+)$/);

      if (markerMatch) {
        const idx = parseInt(markerMatch[1]);
        const img = imageMap[idx];
        if (img) {
          imageCount++;
          updateProgressPanel(imageCount, totalImages);
          const ok = await uploadImageViaClipboard(editor, img.url);
          if (ok) successImages++;
          else failImages++;
        }
      } else if (segment.trim()) {
        // 逐段建構時強制 text/plain（與 Dcard 一致），確保圖片插入在正確位置
        await pasteTextSegment(editor, segment, false);
      }
    }

    await reconcileLexicalState(editor);
    return { successImages, failImages };
  }

  // ── 進度面板 ──

  function showProgressPanel(title, totalImages) {
    removeProgressPanel();
    const panel = document.createElement('div');
    panel.id = 'vocus-progress-panel';
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
          background: linear-gradient(135deg, #10B981 0%, #059669 100%);
          color: white; padding: 14px 16px;
        ">
          <div style="font-weight: 700;">⏳ 方格子圖片插入中...</div>
          <div style="font-size: 12px; opacity: 0.9; margin-top: 3px;
            overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 280px;">
            ${escapeHtml(title)}
          </div>
        </div>
        <div style="padding: 12px 16px;">
          <div id="vocus-progress-text" style="font-size: 13px; color: #374151; margin-bottom: 8px;">
            準備中...
          </div>
          <div style="height: 6px; background: #e5e7eb; border-radius: 3px; overflow: hidden;">
            <div id="vocus-progress-bar" style="
              height: 100%; background: linear-gradient(90deg, #10B981, #059669);
              border-radius: 3px; width: 0%; transition: width 0.3s;
            "></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(panel);
  }

  function updateProgressPanel(current, total) {
    const text = document.getElementById('vocus-progress-text');
    const bar = document.getElementById('vocus-progress-bar');
    if (text) text.textContent = `插入第 ${current}/${total} 張圖片...`;
    if (bar) bar.style.width = `${(current / total) * 100}%`;
  }

  function removeProgressPanel() {
    const panel = document.getElementById('vocus-progress-panel');
    if (panel) panel.remove();
  }

  // ── 自動貼文主流程 ──

  async function autoPasteArticle(articleData) {
    const {
      title,
      paste_content,
      plain_content,
      content,
      content_markdown,
      image_positions,
    } = articleData;
    const hasImages = image_positions && image_positions.length > 0;

    // 優先使用 content_markdown（保留 ## heading 語法）
    const textContent = content_markdown || paste_content || plain_content || content || '';

    console.log(
      `${LOG_PREFIX} 開始自動貼文 (Markdown: ${!!content_markdown}, 圖片: ${hasImages ? image_positions.length : 0})`,
    );

    // 等待編輯器
    const editor = await waitForElement(EDITOR_SELECTORS, 10000);
    if (!editor) {
      showToast('找不到方格子編輯器，請確認在編輯頁面', 'error');
      return;
    }
    console.log(`${LOG_PREFIX} 編輯器已找到`);

    // 1. 填入標題
    let titleOk = false;
    if (title) {
      try {
        titleOk = await fillTitle(title);
        if (!titleOk) {
          // 複製標題到剪貼簿作為 fallback
          await copyToClipboard(title);
          showToast('標題已複製到剪貼簿，請手動貼上');
        }
      } catch (e) {
        console.error(`${LOG_PREFIX} 填入標題失敗:`, e);
      }
    }

    // 2. 內容 + 圖片
    if (hasImages && paste_content) {
      showProgressPanel(title, image_positions.length);
      const { successImages, failImages } = await pasteContentWithImages(
        editor,
        paste_content,
        image_positions,
      );
      removeProgressPanel();

      if (successImages > 0 || titleOk) {
        showToast(
          `✅ 文章已貼上方格子！插入 ${successImages} 張圖片` +
            (failImages > 0 ? `，${failImages} 張失敗` : ''),
          'success',
        );
      } else {
        showToast('部分內容插入失敗', 'error');
      }
    } else {
      // 無圖片：用 Markdown 快捷鍵建立標題 + text/plain 貼一般文字
      let contentOk = false;
      try {
        contentOk = await pasteContent(editor, textContent);
      } catch (e) {
        console.error(`${LOG_PREFIX} 貼上內文失敗:`, e);
      }

      if (titleOk || contentOk) {
        showToast('✅ 文章已貼上方格子！', 'success');
      } else {
        showPasteHelper();
        showToast('自動貼上失敗，請手動複製', 'error');
      }
    }
  }

  // ── 手動複製模式（fallback）──

  function showPasteHelper() {
    const old = document.getElementById('vocus-paste-helper');
    if (old) old.remove();
    if (!pendingArticle) return;

    const helper = document.createElement('div');
    helper.id = 'vocus-paste-helper';
    helper.innerHTML = `
      <div style="
        position: fixed; bottom: 24px; right: 24px;
        background: linear-gradient(135deg, #10B981 0%, #059669 100%);
        color: white; padding: 16px 20px; border-radius: 16px;
        box-shadow: 0 8px 32px rgba(16, 185, 129, 0.4);
        z-index: 999999; font-size: 14px; max-width: 320px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      ">
        <div style="font-weight: 700; margin-bottom: 8px;">📝 文章已就緒（方格子）</div>
        <div style="font-size: 12px; opacity: 0.9; margin-bottom: 12px;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(pendingArticle.title)}
        </div>
        <div style="display: flex; gap: 8px;">
          <button id="vocus-auto-paste" style="
            flex: 1; padding: 8px; border: none; border-radius: 8px;
            background: rgba(255,255,255,0.3); color: white;
            font-size: 12px; font-weight: 600; cursor: pointer;
          ">🚀 自動貼上</button>
          <button id="vocus-copy-title" style="
            flex: 1; padding: 8px; border: none; border-radius: 8px;
            background: rgba(255,255,255,0.2); color: white;
            font-size: 12px; font-weight: 600; cursor: pointer;
          ">複製標題</button>
          <button id="vocus-copy-content" style="
            flex: 1; padding: 8px; border: none; border-radius: 8px;
            background: rgba(255,255,255,0.2); color: white;
            font-size: 12px; font-weight: 600; cursor: pointer;
          ">複製內容</button>
          <button id="vocus-dismiss" style="
            padding: 8px; border: none; border-radius: 8px;
            background: rgba(255,255,255,0.1); color: white;
            font-size: 12px; cursor: pointer;
          ">✕</button>
        </div>
      </div>
    `;
    document.body.appendChild(helper);

    document.getElementById('vocus-auto-paste').addEventListener('click', async () => {
      helper.remove();
      await autoPasteArticle(pendingArticle);
    });
    document.getElementById('vocus-copy-title').addEventListener('click', async () => {
      await copyToClipboard(pendingArticle.title);
      showToast('已複製標題');
    });
    document.getElementById('vocus-copy-content').addEventListener('click', async () => {
      const text = pendingArticle.content_markdown || pendingArticle.plain_content || pendingArticle.content;
      await copyToClipboard(text);
      showToast('已複製內容');
    });
    document.getElementById('vocus-dismiss').addEventListener('click', () => {
      helper.remove();
      pendingArticle = null;
    });
  }

  // ── 編輯器偵測（保留，開發用）──

  function detectAndReport() {
    const editor = document.querySelector(EDITOR_SELECTORS.join(','));
    if (!editor) return;

    const analysis = {
      tagName: editor.tagName,
      className: editor.className,
      id: editor.id,
      role: editor.getAttribute('role'),
      contentEditable: editor.contentEditable,
      dataAttributes: {},
      titleField: null,
    };

    for (const attr of editor.attributes) {
      if (attr.name.startsWith('data-')) {
        analysis.dataAttributes[attr.name] = attr.value;
      }
    }

    // 掃描標題
    for (const sel of TITLE_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        analysis.titleField = {
          selector: sel,
          tagName: el.tagName,
          placeholder: el.placeholder || el.getAttribute('data-placeholder'),
        };
        break;
      }
    }

    // 掃描所有 textarea 和 input
    const allInputs = document.querySelectorAll('textarea, input[type="text"]');
    analysis.allInputFields = Array.from(allInputs).map((el) => ({
      tagName: el.tagName,
      name: el.name,
      placeholder: el.placeholder,
      className: (el.className || '').toString().slice(0, 80),
    }));

    console.log(`${LOG_PREFIX} 編輯器分析:`, analysis);

    chrome.runtime.sendMessage({
      type: 'VOCUS_EDITOR_DETECTED',
      data: {
        url: window.location.href,
        framework: 'Lexical',
        analysis,
      },
    });
  }

  // ── creatordesk 自動點「文章」+ 等待編輯器 ──

  /**
   * 在 creatordesk 頁面自動點「文章」按鈕，等待 SPA 路由跳轉到 new-editor，
   * 偵測到 Lexical 編輯器後自動貼文。
   */
  async function navigateToEditorAndPaste(articleData) {
    const isCreatorDesk = /vocus\.cc\/creatordesk/i.test(window.location.href);
    const isEditor = /vocus\.cc\/new-editor/i.test(window.location.href);

    if (isEditor) {
      // 已經在編輯器頁面，直接貼
      await autoPasteArticle(articleData);
      return;
    }

    if (!isCreatorDesk) {
      showToast('請先開啟方格子創作者頁面', 'error');
      return;
    }

    // 在 creatordesk 頁面：找「文章」按鈕並點擊
    showToast('正在開啟方格子編輯器...', 'info');

    // 尋找「文章」按鈕 — 從截圖看是一個卡片，包含文字「文章」和「完整的編輯功能」
    const clicked = await clickArticleButton();
    if (!clicked) {
      showToast('找不到「文章」按鈕，請手動點擊後再試', 'error');
      showPasteHelper();
      return;
    }

    // 等待 SPA 路由跳轉到 new-editor（Next.js client-side navigation）
    console.log(`${LOG_PREFIX} 已點擊「文章」，等待跳轉到編輯器...`);

    const editorReady = await waitForEditorAfterNavigation(30000);
    if (editorReady) {
      console.log(`${LOG_PREFIX} 編輯器已就緒，開始貼文`);
      await autoPasteArticle(articleData);
    } else {
      showToast('等待編輯器超時，請手動點「文章」後使用浮動面板', 'error');
      showPasteHelper();
    }
  }

  /**
   * 尋找並點擊 creatordesk 上的「文章」按鈕
   */
  async function clickArticleButton() {
    // 策略 1：找包含「文章」文字的可點擊元素
    const allElements = document.querySelectorAll('a, button, div[role="button"], [onclick]');
    for (const el of allElements) {
      const text = (el.textContent || '').trim();
      if (text.includes('文章') && text.includes('完整的編輯功能')) {
        el.click();
        return true;
      }
    }

    // 策略 2：找包含「文章」文字的卡片（更寬鬆）
    const candidates = document.querySelectorAll('a, div[class*="card"], div[class*="Card"], button');
    for (const el of candidates) {
      const text = (el.textContent || '').trim();
      // 要包含「文章」但不能是左側的文章列表項目
      if (text === '文章完整的編輯功能' || text === '文章\n完整的編輯功能') {
        el.click();
        return true;
      }
    }

    // 策略 3：最寬鬆 — 找所有包含「文章」的鏈接
    const links = document.querySelectorAll('a[href*="new-editor"], a[href*="editor"]');
    if (links.length > 0) {
      links[0].click();
      return true;
    }

    // 策略 4：掃描所有元素找精確文字「文章」
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      { acceptNode: (node) =>
        node.textContent.trim() === '文章' ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
      },
    );
    const textNode = walker.nextNode();
    if (textNode) {
      // 找到包含「文章」的最近可點擊祖先
      let target = textNode.parentElement;
      for (let i = 0; i < 5 && target; i++) {
        if (target.tagName === 'A' || target.tagName === 'BUTTON' ||
            target.getAttribute('role') === 'button' ||
            target.style.cursor === 'pointer' ||
            target.onclick) {
          target.click();
          return true;
        }
        target = target.parentElement;
      }
      // fallback：直接點文字的父元素
      if (textNode.parentElement) {
        textNode.parentElement.click();
        return true;
      }
    }

    return false;
  }

  /**
   * 等待 SPA 路由跳轉後編輯器出現
   * Next.js client-side navigation 不會重新載入頁面，
   * 但 DOM 會更新，Lexical 編輯器會出現
   */
  function waitForEditorAfterNavigation(timeout = 30000) {
    return new Promise((resolve) => {
      const startTime = Date.now();

      // 同時監聽 URL 變化和 DOM 變化
      const check = setInterval(() => {
        // 檢查 URL 是否已跳轉到 new-editor
        const isNowEditor = /vocus\.cc\/new-editor/i.test(window.location.href);
        // 檢查 Lexical 編輯器是否已出現
        const editorEl = document.querySelector(EDITOR_SELECTORS.join(','));

        if (isNowEditor && editorEl) {
          clearInterval(check);
          // 再等一下讓編輯器完全初始化
          setTimeout(() => resolve(true), 1000);
          return;
        }

        if (Date.now() - startTime > timeout) {
          clearInterval(check);
          resolve(false);
        }
      }, 500);
    });
  }

  // ── 訊息監聽 ──

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'DETECT_VOCUS_EDITOR') {
      detectAndReport();
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'AUTO_PASTE_ARTICLE_VOCUS') {
      pendingArticle = message.data;
      autoPasteArticle(message.data);
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'CLICK_VOCUS_ARTICLE_BUTTON') {
      // 從 creatordesk 頁面點「文章」按鈕（會開新分頁）
      clickArticleButton().then((clicked) => {
        if (!clicked) {
          showToast('找不到「文章」按鈕，請手動點擊', 'error');
        }
      });
      sendResponse({ success: true });
      return true;
    }

    if (message.type === 'PASTE_TO_VOCUS') {
      pendingArticle = message.data;
      showPasteHelper();
      sendResponse({ success: true });
      return true;
    }

    return true;
  });

  // ── 啟動 ──

  console.log(`${LOG_PREFIX} 內容腳本已載入: ${window.location.href}`);

  const isEditorPage = /vocus\.cc\/new-editor/i.test(window.location.href);

  if (isEditorPage) {
    // 在編輯器頁面：檢查 storage 是否有待貼文章（從 creatordesk 點「文章」開新分頁的情境）
    chrome.storage.local.get('pendingVocusArticle', async (data) => {
      if (data.pendingVocusArticle) {
        console.log(`${LOG_PREFIX} 從 storage 讀取到待貼文章，等待編輯器...`);
        // 清除 storage，避免重複貼
        await chrome.storage.local.remove('pendingVocusArticle');
        pendingArticle = data.pendingVocusArticle;

        // 等待 Lexical 編輯器出現
        const editor = await waitForElement(EDITOR_SELECTORS, 15000);
        if (editor) {
          console.log(`${LOG_PREFIX} 編輯器已就緒，開始自動貼文`);
          await autoPasteArticle(pendingArticle);
        } else {
          console.warn(`${LOG_PREFIX} 等待編輯器超時`);
          showToast('編輯器載入超時，請使用浮動面板手動貼上', 'error');
          showPasteHelper();
        }
      } else {
        // 沒有待貼文章，僅偵測編輯器
        setTimeout(detectAndReport, 2000);
      }
    });
  }
})();
