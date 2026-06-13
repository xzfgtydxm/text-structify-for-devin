// Text Structify - Background Service Worker
// LLM-only: receives text + context from content script, returns structured text

const DEBUG = false;

function debugLog(context, message, data = null) {
  if (!DEBUG) return;
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${context}] ${message}`;
  if (data) { console.log(logMessage, data); } else { console.log(logMessage); }
}

debugLog('INIT', 'Text Structify background script loaded');

// --- Content Script Management ---

async function ensureContentScriptLoaded(tabId) {
  try {
    const pingPromise = chrome.tabs.sendMessage(tabId, { action: 'ping' });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Ping timeout')), 1000)
    );
    await Promise.race([pingPromise, timeoutPromise]);
    return true;
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      await new Promise(resolve => setTimeout(resolve, 200));
      try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
        return true;
      } catch (verifyError) { return false; }
    } catch (injectError) { return false; }
  }
}

// --- Keyboard Shortcut ---

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'structify-text') {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') ||
          tab.url.startsWith('edge://') || tab.url.startsWith('about:')) {
        return;
      }
      const loaded = await ensureContentScriptLoaded(tab.id);
      if (loaded) {
        chrome.tabs.sendMessage(tab.id, { action: 'structifyText' });
      }
    } catch (error) {
      debugLog('SHORTCUT', 'Error', error);
    }
  }
});

// --- Message Handling ---

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'structify') {
    structifyText(request.text, request.context, request.appName, request.currentUrl)
      .then(result => sendResponse({ success: true, text: result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  } else if (request.action === 'getDebugLogs') {
    chrome.storage.local.get(['debugLogs'], (result) => {
      sendResponse(result.debugLogs || []);
    });
    return true;
  }
});

// --- App Detection ---

function detectApp(url) {
  if (!url) return 'Web';
  try {
    const domain = new URL(url).hostname;
    if (domain.includes('devin.ai') || domain.includes('app.devin.ai')) return 'Devin AI';
    if (domain.includes('chatgpt.com') || domain.includes('chat.openai.com')) return 'ChatGPT';
    if (domain.includes('claude.ai')) return 'Claude';
    if (domain.includes('gmail.com') || domain.includes('mail.google.com')) return 'Gmail';
    if (domain.includes('slack.com')) return 'Slack';
    if (domain.includes('discord.com')) return 'Discord';
    if (domain.includes('github.com')) return 'GitHub';
    if (domain.includes('docs.google.com')) return 'Google Docs';
    if (domain.includes('notion.so')) return 'Notion';
    if (domain.includes('linkedin.com')) return 'LinkedIn';
    if (domain.includes('twitter.com') || domain.includes('x.com')) return 'Twitter/X';
    return 'Web';
  } catch (e) { return 'Web'; }
}

// --- System Prompt ---

const SYSTEM_PROMPT = `你是一个文本整理助手。用户会给你一段语音转写的原始文字（可能由语音输入得来），通常包含：
- 口语化表达（语气词、重复、冗余）
- 语法错误或表述不清
- 缺乏结构和条理

你的任务是将其整理成：
1. 结构清晰、表达准确的文字
2. 保留原意，不添加额外内容
3. 如果内容涉及多个要点，用编号或分段列出
4. 根据当前应用场景和对话上下文调整语气和格式

场景适配指南：
- AI 对话平台（ChatGPT、Claude、Devin 等）：将口语整理成清晰的指令/问题，保持技术准确性
- 邮件（Gmail）：专业、正式
- 即时通讯（Slack、Discord）：简洁、友好
- 代码平台（GitHub）：技术化、精确
- 其他网站：清晰、标准

上下文使用指南：
- 如果提供了对话上下文，参考它来理解用户在说什么（比如代词指代、专有名词、话题延续等）
- 利用上下文来消歧义、补充省略的主语/宾语
- 但不要在输出中复述上下文内容

重要：直接输出整理后的文字，不要加前缀说明（如"整理后："），不要用 JSON 包裹，不要加引号。`;

// --- Core: Structify Text ---

async function structifyText(rawText, conversationContext, appName, currentUrl) {
  debugLog('STRUCTIFY', 'Starting', { appName, currentUrl, textLen: rawText.length });

  if (!rawText || rawText.trim() === '') {
    throw new Error('输入框为空，没有需要整理的文字。');
  }

  // Load endpoint config + template
  const storage = await chrome.storage.sync.get([
    'endpoints', 'activeEndpointId', 'selectedLlmModel',
    'promptTemplates', 'activeTemplateId',
    'customSystemPrompt' // legacy fallback
  ]);

  const endpoints = storage.endpoints || [];
  const activeId = storage.activeEndpointId || '';
  const endpoint = endpoints.find(ep => ep.id === activeId);

  if (!endpoint || !endpoint.apiKey) {
    throw new Error('请先在插件弹窗中配置 API 端点和 Key');
  }

  const baseUrl = endpoint.baseUrl.replace(/\/+$/, '');
  const apiKey = endpoint.apiKey;
  const llmModel = storage.selectedLlmModel || '';

  if (!llmModel) {
    throw new Error('请先在插件弹窗中选择 LLM 模型');
  }

  // Build system prompt from active template (or legacy/fallback)
  let systemPrompt = SYSTEM_PROMPT;
  const templates = storage.promptTemplates || [];
  const activeTemplateId = storage.activeTemplateId || '';
  if (templates.length > 0) {
    const activeTemplate = templates.find(t => t.id === activeTemplateId) || templates[0];
    systemPrompt = activeTemplate.prompt || SYSTEM_PROMPT;
  } else if (storage.customSystemPrompt) {
    systemPrompt = storage.customSystemPrompt;
  }

  // Add app context
  systemPrompt += '\n\n当前应用: ' + (appName || detectApp(currentUrl));
  if (currentUrl) systemPrompt += '\n当前URL: ' + currentUrl;

  // Build user message with context
  let userMessage = rawText;
  if (conversationContext && conversationContext.trim()) {
    userMessage = '【页面对话上下文（仅供参考，不要在输出中复述）】\n' +
      conversationContext.trim() +
      '\n\n【需要整理的文字】\n' + rawText;
  }

  debugLog('STRUCTIFY', 'Calling LLM', { url: baseUrl + '/chat/completions', model: llmModel });

  const llmResponse = await fetch(baseUrl + '/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: llmModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 6000
    })
  });

  if (!llmResponse.ok) {
    const errorText = await llmResponse.text();
    console.error('LLM API error:', llmResponse.status, errorText);
    throw new Error('LLM 整理失败 (HTTP ' + llmResponse.status + ')。请检查 API 配置。');
  }

  const llmResult = await llmResponse.json();

  if (!llmResult.choices || !llmResult.choices[0]) {
    console.error('Invalid LLM response:', llmResult);
    throw new Error('LLM 返回格式异常');
  }

  let formattedText = llmResult.choices[0].message.content.trim();
  if (!formattedText) return rawText;

  // Handle JSON-wrapped responses
  try {
    const jsonResponse = JSON.parse(formattedText);
    if (jsonResponse.corrected_text) return jsonResponse.corrected_text;
    if (jsonResponse.text) return jsonResponse.text;
    if (jsonResponse.content) return jsonResponse.content;
  } catch (e) {
    // Not JSON, use as-is
  }

  return formattedText;
}
