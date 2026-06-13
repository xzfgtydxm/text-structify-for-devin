// Text Structify for Devin - Content Script
// Injects "整理" buttons next to text inputs, extracts page conversation context

// Track injected elements: Maps inputEl -> btn element
// Using WeakMap so we can check if the button is still in DOM
let injectedButtons = new WeakMap();
let isProcessing = false;

// --- Message Listener ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'structifyText') {
    structifyFocusedInput();
  } else if (request.action === 'ping') {
    sendResponse({ status: 'ready' });
  }
});

// --- Inject Styles ---

function injectStyles() {
  if (document.getElementById('text-structify-styles')) return;
  const style = document.createElement('style');
  style.id = 'text-structify-styles';
  style.textContent = `
    .ts-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px;
      background: transparent;
      color: #9ca3af;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      z-index: 2147483646;
      transition: all 0.2s ease;
      font-family: system-ui, -apple-system, sans-serif;
      white-space: nowrap;
      line-height: 1;
      flex-shrink: 0;
    }
    .ts-btn:hover {
      color: #667eea;
      background: rgba(102, 126, 234, 0.1);
    }
    .ts-btn:active { transform: scale(0.9); }
    .ts-btn.processing {
      opacity: 0.7;
      cursor: wait;
      animation: tsPulse 1.5s infinite;
    }
    @keyframes tsPulse { 0%,100% { opacity: 0.7; } 50% { opacity: 1; } }
    .ts-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      color: white;
      z-index: 2147483647;
      animation: tsSlideIn 0.3s ease-out;
      max-width: 350px;
      word-wrap: break-word;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .ts-toast.success { background: #00C851; }
    .ts-toast.error { background: #FF4444; }
    .ts-toast.info { background: #2196F3; }
    @keyframes tsSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes tsSlideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
  `;
  document.head.appendChild(style);
}

// --- Find Text Inputs ---

function findTextInputs() {
  const inputs = [];
  const seen = new Set();

  function addIfNew(el) {
    if (!el || seen.has(el) || !isVisible(el)) return;
    seen.add(el);
    // Check if already injected AND button is still in the DOM
    const existingBtn = injectedButtons.get(el);
    if (existingBtn && existingBtn.isConnected) return;
    inputs.push(el);
  }

  document.querySelectorAll('textarea').forEach(addIfNew);
  document.querySelectorAll('[contenteditable="true"], [contenteditable=""]').forEach(addIfNew);
  document.querySelectorAll('[role="textbox"]').forEach(addIfNew);

  return inputs;
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
}

// --- Detect Slate Editor ---

function isSlateEditor(el) {
  return el.hasAttribute('data-slate-editor') ||
    !!el.querySelector('[data-slate-node]');
}

// --- Get Text From Input ---

function getInputText(el) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    return el.value;
  }
  // Skip Slate placeholder text
  if (el.querySelector('[data-slate-placeholder]')) return '';
  return el.innerText || el.textContent || '';
}

// --- Set Text To Input ---

function setInputText(el, text) {
  if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'
    );
    if (nativeSetter && nativeSetter.set) {
      nativeSetter.set.call(el, text);
    } else {
      el.value = text;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    setContentEditable(el, text);
  }
}

function setContentEditable(el, text) {
  el.focus();

  // For Slate editors: NEVER use execCommand('insertText').
  // It creates DOM nodes outside Slate's internal model, causing
  // "Cannot resolve a Slate node from DOM node" crash when user edits.
  // Instead, use ClipboardEvent paste simulation — Slate has dedicated
  // paste handlers that properly update the model.
  if (isSlateEditor(el)) {
    setContentEditableSlate(el, text);
    return;
  }

  // For non-Slate editors: select all and use execCommand
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  selection.removeAllRanges();
  selection.addRange(range);

  try {
    if (document.execCommand('insertText', false, text)) return;
  } catch (e) { /* fall through */ }

  clipboardFallback(el, text);
}

function setContentEditableSlate(el, text) {
  // Step 1: Select all content using selectAllChildren
  el.focus();
  const sel = window.getSelection();
  sel.selectAllChildren(el);

  // Step 2: Dispatch selectionchange so Slate syncs its internal
  // selection state with the DOM selection we just set
  document.dispatchEvent(new Event('selectionchange'));

  // Step 3: Wait for Slate to process the selection sync,
  // then simulate paste — Slate's paste handler reads clipboardData
  // and creates proper Slate nodes that stay editable
  setTimeout(() => {
    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true, cancelable: true, clipboardData: dt
      });
      el.dispatchEvent(pasteEvent);

      // Verify paste worked after Slate processes it
      setTimeout(() => {
        const afterText = (el.innerText || '').trim();
        const hasPlaceholder = !!el.querySelector('[data-slate-placeholder]');
        if (hasPlaceholder || afterText.length < 5) {
          clipboardFallback(el, text);
        }
      }, 500);
    } catch (e) {
      clipboardFallback(el, text);
    }
  }, 150);
}

function clipboardFallback(el, text) {
  const writeAndNotify = () => {
    // Select all content so user can paste-replace
    el.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el);
    sel.removeAllRanges();
    sel.addRange(range);
    showToast('整理完成！请按 Ctrl+V 粘贴替换当前文字', 'success');
  };

  try {
    navigator.clipboard.writeText(text).then(writeAndNotify).catch(() => {
      // Fallback: hidden textarea copy
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      writeAndNotify();
    });
  } catch (e) {
    showToast('整理完成但无法写入，请手动粘贴。', 'error');
  }
}

// --- Extract Conversation Context ---

function extractConversationContext() {
  const domain = window.location.hostname;

  if (domain.includes('devin.ai') || domain.includes('app.devin.ai')) {
    return extractDevinLastReply();
  }
  if (domain.includes('chatgpt.com') || domain.includes('chat.openai.com')) {
    return extractLastAIReply([
      '[data-message-author-role="assistant"]',
      'div.markdown'
    ]);
  }
  if (domain.includes('claude.ai')) {
    return extractLastAIReply([
      '.font-claude-message',
      '[class*="Message"][class*="assistant"]'
    ]);
  }
  return extractLastAIReply([
    '[class*="message"]',
    '[class*="assistant"]',
    '[role="log"]'
  ]);
}

function extractDevinLastReply() {
  const scrollable = document.querySelector('[devin-scrollable="true"]') ||
    document.querySelector('main [tabindex="0"]');
  if (!scrollable) return '';

  const messageBlocks = scrollable.querySelectorAll(':scope > div > div');
  if (!messageBlocks || messageBlocks.length === 0) return '';

  let lastReply = '';
  for (let i = messageBlocks.length - 1; i >= 0; i--) {
    const block = messageBlocks[i];
    const ariaLabel = block.getAttribute('aria-label') || '';
    if (ariaLabel.toLowerCase().includes('user')) continue;

    const text = (block.innerText || '').trim();
    if (text.length < 30) continue;
    if (/^(Devin went to sleep|Thought for|Devin is sleeping)/i.test(text)) continue;

    const hasImages = block.querySelectorAll('img:not([src*="avatar"])').length;
    const hasLinks = block.querySelectorAll('a[href*="attachment"], a[download]').length;
    const pureTextLen = text.replace(/\s+/g, ' ').length;
    if (pureTextLen < 50 && (hasImages > 0 || hasLinks > 0)) continue;

    lastReply = text;
    break;
  }

  if (!lastReply) return '';
  if (lastReply.length > 2000) {
    lastReply = lastReply.slice(0, 2000) + '\n...(截断)...';
  }
  return '【Devin 上一条回复】\n' + lastReply;
}

function extractLastAIReply(selectors) {
  for (const selector of selectors) {
    try {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const lastEl = elements[elements.length - 1];
        const text = (lastEl.innerText || lastEl.textContent || '').trim();
        if (text.length >= 30) {
          const truncated = text.length > 2000 ? text.slice(0, 2000) + '\n...(截断)...' : text;
          return '【AI 上一条回复】\n' + truncated;
        }
      }
    } catch (e) { /* ignore */ }
  }
  return '';
}

// --- Inject Button ---

function injectButton(inputEl) {
  // Check if already injected AND button is still in the DOM
  const existingBtn = injectedButtons.get(inputEl);
  if (existingBtn && existingBtn.isConnected) return;

  const btn = document.createElement('button');
  btn.className = 'ts-btn';
  btn.innerHTML = '✨';
  btn.title = '用 AI 整理这段文字 (Ctrl+Shift+1)';
  btn.type = 'button';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleStructify(inputEl, btn);
  });

  const domain = window.location.hostname;

  if (domain.includes('devin.ai')) {
    if (placeDevinButton(inputEl, btn)) {
      setupDevinVisibilityToggle(inputEl, btn);
      injectedButtons.set(inputEl, btn);
      return;
    }
  }

  // Generic: place after the input
  const parent = inputEl.parentElement;
  if (!parent) return;
  if (inputEl.nextSibling) {
    parent.insertBefore(btn, inputEl.nextSibling);
  } else {
    parent.appendChild(btn);
  }
  injectedButtons.set(inputEl, btn);
}

function placeDevinButton(inputEl, btn) {
  // Walk up from contenteditable to find the container that holds
  // both the input and the toolbar buttons (send, mic, etc.)
  // Use position-based detection — don't rely on CSS class names.
  let container = inputEl;
  for (let i = 0; i < 10; i++) {
    container = container.parentElement;
    if (!container || container === document.body || container.tagName === 'MAIN') break;

    // Look for buttons with SVG (send/mic buttons) in the bottom area
    const buttons = container.querySelectorAll('button:not(.ts-btn)');
    const containerRect = container.getBoundingClientRect();
    const bottomSvgBtns = [];

    for (const b of buttons) {
      if (!b.querySelector('svg')) continue;
      const r = b.getBoundingClientRect();
      if (r.height === 0 || r.width === 0) continue;
      // Button must be in the bottom 50% of the container
      if (r.top > containerRect.top + containerRect.height * 0.4) {
        bottomSvgBtns.push(b);
      }
    }

    if (bottomSvgBtns.length < 1) continue;

    // Find the bottom-right-most button (this is the send button)
    bottomSvgBtns.sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      // Prefer rightmost, then bottom-most
      return (rb.right - ra.right) || (rb.bottom - ra.bottom);
    });

    const sendBtn = bottomSvgBtns[0];

    // The send button sits in: grid (1 column, stacks vertically)
    // The grid's parent is: flex row (items-stretch)
    // Insert our button into the flex parent BEFORE the grid
    // so it appears to the LEFT on the same horizontal line.
    const gridParent = sendBtn.parentElement;
    const flexParent = gridParent ? gridParent.parentElement : null;
    if (flexParent && flexParent !== container &&
        window.getComputedStyle(flexParent).display === 'flex') {
      btn.style.alignSelf = 'flex-end';
      flexParent.insertBefore(btn, gridParent);
      return true;
    }
    // Fallback: insert before send button in same parent
    if (gridParent && gridParent !== container) {
      gridParent.insertBefore(btn, sendBtn);
      return true;
    }
  }
  return false;
}

function setupDevinVisibilityToggle(inputEl, btn) {
  function updateVisibility() {
    // Slate renders [data-slate-placeholder] when the editor is empty
    const hasPlaceholder = !!inputEl.querySelector('[data-slate-placeholder]');
    btn.style.display = hasPlaceholder ? 'none' : 'inline-flex';
  }

  updateVisibility();

  // Watch content changes via MutationObserver
  const obs = new MutationObserver(updateVisibility);
  obs.observe(inputEl, { childList: true, subtree: true, characterData: true });
  inputEl.addEventListener('input', updateVisibility);

  // Also poll periodically — voice input SDK may not trigger DOM mutations
  // that our observer catches (e.g., React state updates without DOM changes)
  setInterval(updateVisibility, 500);
}

// --- Handle Structify ---

async function handleStructify(inputEl, btn) {
  if (isProcessing) {
    showToast('正在处理中，请稍候...', 'info');
    return;
  }

  const text = getInputText(inputEl);
  if (!text || text.trim().length === 0) {
    showToast('输入框为空，没有需要整理的文字。', 'error');
    return;
  }

  isProcessing = true;
  const originalLabel = btn.innerHTML;
  btn.innerHTML = '⏳';
  btn.classList.add('processing');

  try {
    const context = extractConversationContext();
    const response = await chrome.runtime.sendMessage({
      action: 'structify',
      text: text,
      context: context,
      appName: detectAppFromDomain(),
      currentUrl: window.location.href
    });

    if (response && response.success) {
      setInputText(inputEl, response.text);
      // Only show "完成" toast if we're not going to show clipboard toast
      if (!isSlateEditor(inputEl)) {
        showToast('文字已整理完成！', 'success');
      }
    } else {
      showToast('整理失败: ' + (response ? response.error : '未知错误'), 'error');
    }
  } catch (error) {
    showToast('错误: ' + error.message, 'error');
  } finally {
    isProcessing = false;
    btn.innerHTML = originalLabel;
    btn.classList.remove('processing');
  }
}

// --- Structify Focused Input (keyboard shortcut) ---

function structifyFocusedInput() {
  const activeEl = document.activeElement;
  if (!activeEl) {
    showToast('请先点击一个输入框', 'error');
    return;
  }

  const isTextInput = activeEl.tagName === 'TEXTAREA' ||
    (activeEl.tagName === 'INPUT' && ['text', 'search'].includes(activeEl.type)) ||
    activeEl.isContentEditable ||
    activeEl.getAttribute('role') === 'textbox';

  if (!isTextInput) {
    showToast('请先点击一个输入框', 'error');
    return;
  }

  let btn = injectedButtons.get(activeEl);
  if (!btn || !btn.isConnected) {
    btn = document.createElement('button');
    btn.className = 'ts-btn';
    btn.innerHTML = '✨';
  }

  handleStructify(activeEl, btn);
}

function detectAppFromDomain() {
  const domain = window.location.hostname;
  if (domain.includes('devin.ai')) return 'Devin AI';
  if (domain.includes('chatgpt.com') || domain.includes('chat.openai.com')) return 'ChatGPT';
  if (domain.includes('claude.ai')) return 'Claude';
  if (domain.includes('gmail.com') || domain.includes('mail.google.com')) return 'Gmail';
  if (domain.includes('slack.com')) return 'Slack';
  if (domain.includes('github.com')) return 'GitHub';
  return 'Web';
}

// --- Toast ---

function showToast(message, type) {
  const existing = document.getElementById('ts-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'ts-toast';
  toast.className = 'ts-toast ' + type;
  toast.textContent = message;
  document.body.appendChild(toast);

  const duration = type === 'error' ? 5000 : 3000;
  setTimeout(() => {
    if (toast.parentNode) {
      toast.style.animation = 'tsSlideOut 0.3s ease-out';
      setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }
  }, duration);
}

// --- Scan & Inject ---

function scanAndInject() {
  injectStyles();
  const inputs = findTextInputs();
  inputs.forEach(el => injectButton(el));
}

// Initial scan
scanAndInject();

// Watch for new inputs (SPAs like Devin/ChatGPT dynamically add textareas)
const observer = new MutationObserver(() => {
  scanAndInject();
});
observer.observe(document.body, { childList: true, subtree: true });

// Re-scan periodically for dynamic content + re-inject if buttons were removed
setInterval(scanAndInject, 2000);
