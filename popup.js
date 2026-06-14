// Text Structify for Devin - Popup Script
// Manages API endpoints and LLM model selection

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    activeEndpoint: document.getElementById('active-endpoint'),
    llmModel: document.getElementById('llm-model'),
    fetchModelsBtn: document.getElementById('fetch-models-btn'),
    endpointList: document.getElementById('endpoint-list'),
    addEndpointBtn: document.getElementById('add-endpoint-btn'),
    endpointForm: document.getElementById('endpoint-form'),
    editEndpointId: document.getElementById('edit-endpoint-id'),
    epName: document.getElementById('ep-name'),
    epUrl: document.getElementById('ep-url'),
    epKey: document.getElementById('ep-key'),
    saveEndpointBtn: document.getElementById('save-endpoint-btn'),
    cancelEndpointBtn: document.getElementById('cancel-endpoint-btn'),
    settingsLink: document.getElementById('settings-link'),
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    toast: document.getElementById('toast'),
    aboutLink: document.getElementById('about-link'),
    activeTemplateSelect: document.getElementById('active-template-select')
  };

  let endpoints = [];
  let activeEndpointId = '';
  let selectedLlmModel = '';
  let promptTemplates = [];
  let activeTemplateId = '';

  async function loadConfigFile() {
    // Try config.json first (user's private config with real keys),
    // then fall back to config.default.json (template)
    for (const filename of ['config.json', 'config.default.json']) {
      try {
        const url = chrome.runtime.getURL(filename);
        const resp = await fetch(url);
        if (!resp.ok) continue;
        return await resp.json();
      } catch (e) {
        continue;
      }
    }
    return null;
  }

  async function loadState() {
    return new Promise(async (resolve) => {
      chrome.storage.sync.get([
        'endpoints', 'activeEndpointId', 'selectedLlmModel',
        'promptTemplates', 'activeTemplateId',
        'configLoaded'
      ], async (result) => {
        endpoints = result.endpoints || [];
        activeEndpointId = result.activeEndpointId || '';
        selectedLlmModel = result.selectedLlmModel || '';
        promptTemplates = result.promptTemplates || [];
        activeTemplateId = result.activeTemplateId || '';

        if (endpoints.length === 0 && !result.configLoaded) {
          const config = await loadConfigFile();
          if (config && config.endpoints && config.endpoints.length > 0) {
            endpoints = config.endpoints.map((ep, i) => ({
              id: 'cfg-' + i,
              name: ep.name || ('Endpoint ' + (i + 1)),
              baseUrl: ep.baseUrl || '',
              apiKey: ep.apiKey || ''
            }));
            const activeEp = config.activeEndpoint
              ? endpoints.find(ep => ep.name === config.activeEndpoint)
              : null;
            activeEndpointId = activeEp ? activeEp.id : endpoints[0].id;
            if (config.model) selectedLlmModel = config.model;
          } else {
            endpoints.push({
              id: 'default-openai',
              name: 'OpenAI',
              baseUrl: 'https://api.openai.com/v1',
              apiKey: ''
            });
            activeEndpointId = 'default-openai';
          }
          chrome.storage.sync.set({ configLoaded: true });
          saveState();
        }
        if (!activeEndpointId && endpoints.length > 0) {
          activeEndpointId = endpoints[0].id;
        }
        renderTemplateSelect();
        resolve();
      });
    });
  }

  function renderTemplateSelect() {
    elements.activeTemplateSelect.innerHTML = '';
    if (promptTemplates.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = '请在高级设置中配置模板';
      elements.activeTemplateSelect.appendChild(opt);
      return;
    }
    promptTemplates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === activeTemplateId) opt.selected = true;
      elements.activeTemplateSelect.appendChild(opt);
    });
  }

  function saveState() {
    chrome.storage.sync.set({
      endpoints,
      activeEndpointId,
      selectedLlmModel: elements.llmModel.value
    });
  }

  function renderEndpoints() {
    elements.endpointList.innerHTML = '';
    elements.activeEndpoint.innerHTML = '';

    endpoints.forEach((ep) => {
      const opt = document.createElement('option');
      opt.value = ep.id;
      opt.textContent = ep.name;
      if (ep.id === activeEndpointId) opt.selected = true;
      elements.activeEndpoint.appendChild(opt);

      const item = document.createElement('div');
      item.className = 'endpoint-item' + (ep.id === activeEndpointId ? ' active' : '');
      item.innerHTML = `
        <div class="ep-status ${ep.apiKey ? 'unknown' : 'offline'}" title="${ep.apiKey ? '未测试' : '未配置 Key'}"></div>
        <span class="ep-name" title="${ep.baseUrl}">${ep.name}</span>
        <div class="ep-actions">
          <button class="edit-ep" data-id="${ep.id}" title="编辑">✏️</button>
          <button class="delete-ep" data-id="${ep.id}" title="删除">🗑️</button>
        </div>
      `;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.ep-actions')) return;
        activeEndpointId = ep.id;
        elements.activeEndpoint.value = ep.id;
        saveState();
        renderEndpoints();
        fetchModels();
      });
      elements.endpointList.appendChild(item);
    });

    elements.endpointList.querySelectorAll('.edit-ep').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const ep = endpoints.find(x => x.id === btn.dataset.id);
        if (ep) {
          elements.editEndpointId.value = ep.id;
          elements.epName.value = ep.name;
          elements.epUrl.value = ep.baseUrl;
          elements.epKey.value = ep.apiKey;
          elements.endpointForm.classList.add('show');
        }
      });
    });
    elements.endpointList.querySelectorAll('.delete-ep').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        endpoints = endpoints.filter(x => x.id !== btn.dataset.id);
        if (activeEndpointId === btn.dataset.id) {
          activeEndpointId = endpoints.length > 0 ? endpoints[0].id : '';
        }
        saveState();
        renderEndpoints();
      });
    });

    updateStatus();
  }

  function updateStatus() {
    const ep = endpoints.find(x => x.id === activeEndpointId);
    if (!ep || !ep.apiKey) {
      elements.statusDot.className = 'status-dot error';
      elements.statusText.textContent = '请配置 API Key';
    } else if (!selectedLlmModel && !elements.llmModel.value) {
      elements.statusDot.className = 'status-dot error';
      elements.statusText.textContent = '请选择 LLM 模型';
    } else {
      elements.statusDot.className = 'status-dot ready';
      elements.statusText.textContent = '就绪';
    }
  }

  async function fetchModels() {
    const ep = endpoints.find(x => x.id === activeEndpointId);
    if (!ep || !ep.apiKey || !ep.baseUrl) {
      showToast('请先配置端点的 Base URL 和 API Key', 'error');
      return;
    }

    elements.llmModel.innerHTML = '<option value="">获取中...</option>';
    elements.fetchModelsBtn.disabled = true;

    try {
      const url = ep.baseUrl.replace(/\/+$/, '') + '/models';
      const resp = await fetch(url, {
        headers: { 'Authorization': 'Bearer ' + ep.apiKey }
      });

      if (!resp.ok) throw new Error('HTTP ' + resp.status);

      const data = await resp.json();
      const models = (data.data || data || [])
        .map(m => m.id || m.name || m)
        .filter(m => typeof m === 'string')
        .sort();

      elements.llmModel.innerHTML = '';
      if (models.length === 0) {
        elements.llmModel.innerHTML = '<option value="">无可用模型</option>';
        showToast('未找到可用模型', 'error');
        return;
      }

      models.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        if (m === selectedLlmModel) opt.selected = true;
        elements.llmModel.appendChild(opt);
      });
      saveState();
      showToast('已获取 ' + models.length + ' 个模型', 'success');
      updateStatus();
    } catch (err) {
      elements.llmModel.innerHTML = '<option value="">获取失败</option>';
      showToast('获取模型失败: ' + err.message, 'error');
    } finally {
      elements.fetchModelsBtn.disabled = false;
    }
  }

  function showToast(msg, type) {
    elements.toast.textContent = msg;
    elements.toast.className = 'toast ' + type + ' show';
    setTimeout(() => { elements.toast.className = 'toast'; }, 3000);
  }

  // --- Event Listeners ---

  elements.activeEndpoint.addEventListener('change', () => {
    activeEndpointId = elements.activeEndpoint.value;
    saveState();
    renderEndpoints();
    fetchModels();
  });

  elements.llmModel.addEventListener('change', () => {
    selectedLlmModel = elements.llmModel.value;
    saveState();
    updateStatus();
  });

  elements.fetchModelsBtn.addEventListener('click', fetchModels);

  elements.addEndpointBtn.addEventListener('click', () => {
    elements.editEndpointId.value = '';
    elements.epName.value = '';
    elements.epUrl.value = '';
    elements.epKey.value = '';
    elements.endpointForm.classList.add('show');
  });

  elements.cancelEndpointBtn.addEventListener('click', () => {
    elements.endpointForm.classList.remove('show');
  });

  elements.saveEndpointBtn.addEventListener('click', () => {
    const name = elements.epName.value.trim();
    const url = elements.epUrl.value.trim();
    const key = elements.epKey.value.trim();

    if (!name || !url) {
      showToast('请填写端点名称和 Base URL', 'error');
      return;
    }

    const editId = elements.editEndpointId.value;
    if (editId) {
      const ep = endpoints.find(x => x.id === editId);
      if (ep) {
        ep.name = name;
        ep.baseUrl = url;
        ep.apiKey = key;
      }
    } else {
      endpoints.push({
        id: 'ep-' + Date.now(),
        name, baseUrl: url, apiKey: key
      });
      if (endpoints.length === 1) {
        activeEndpointId = endpoints[0].id;
      }
    }

    elements.endpointForm.classList.remove('show');
    saveState();
    renderEndpoints();
    if (key) fetchModels();
  });

  elements.settingsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });

  elements.activeTemplateSelect.addEventListener('change', () => {
    activeTemplateId = elements.activeTemplateSelect.value;
    chrome.storage.sync.set({ activeTemplateId });
    const t = promptTemplates.find(x => x.id === activeTemplateId);
    showToast('已切换: ' + (t ? t.name : ''), 'success');
  });

  elements.aboutLink.addEventListener('click', (e) => {
    e.preventDefault();
    showToast('Text Structify for Devin v1.2 — 基于 AI-Dictation 改造', 'success');
  });

  // --- Init ---
  await loadState();
  renderEndpoints();

  // Display configured shortcut
  chrome.commands.getAll((commands) => {
    const cmd = commands.find(c => c.name === 'structify-text');
    const badge = document.getElementById('shortcut-badge');
    if (cmd && cmd.shortcut) {
      badge.textContent = cmd.shortcut;
    } else {
      badge.textContent = '未设置快捷键';
    }
  });

  // If active endpoint has a key, auto-fetch models
  const ep = endpoints.find(x => x.id === activeEndpointId);
  if (ep && ep.apiKey) {
    // Restore saved model if available
    if (selectedLlmModel) {
      elements.llmModel.innerHTML = `<option value="${selectedLlmModel}" selected>${selectedLlmModel}</option>`;
      updateStatus();
    }
    fetchModels();
  } else {
    elements.llmModel.innerHTML = '<option value="">请先配置端点</option>';
    updateStatus();
  }
});
