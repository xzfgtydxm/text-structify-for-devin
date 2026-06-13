// Text Structify - Config/Settings Page Script

const DEFAULT_PROMPT = `你是一个文本整理助手。用户会给你一段语音转写的原始文字（可能由语音输入得来），通常包含：
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

const DEFAULT_TEMPLATES = [
  {
    id: 'default',
    name: '默认整理',
    prompt: DEFAULT_PROMPT
  },
  {
    id: 'academic',
    name: '学术模式',
    prompt: `你是一个学术文本整理助手。用户会给你语音转写的原始文字，请将其整理成学术风格的文字。

要求：
1. 使用正式学术用语，避免口语化表达
2. 保持逻辑严谨，论点清晰
3. 如有技术术语或专有名词，确保使用规范表述
4. 如涉及引用或参考，保持引用格式规范
5. 多个论点请按逻辑顺序编号列出
6. 参考上下文中的学术背景信息来消歧义

重要：直接输出整理后的文字，不要加前缀说明。`
  },
  {
    id: 'meeting',
    name: '会议纪要',
    prompt: `你是一个会议纪要整理助手。用户会给你语音转写的会议内容，请将其整理成结构化的会议纪要。

输出格式：
1. 主要议题（一行总结）
2. 讨论要点（编号列出关键点）
3. 决定事项（明确的行动项）
4. 待办事项（如有）

要求：
- 去除语气词和重复内容
- 保留关键信息和具体数据
- 行动项要明确指出责任人（如果提到的话）
- 语言简洁专业

重要：直接输出整理后的纪要，不要加前缀说明。`
  }
];

document.addEventListener('DOMContentLoaded', async () => {
  const elements = {
    activeTemplate: document.getElementById('active-template'),
    templateList: document.getElementById('template-list'),
    addTemplateBtn: document.getElementById('add-template-btn'),
    templateEditor: document.getElementById('template-editor'),
    editTemplateId: document.getElementById('edit-template-id'),
    templateName: document.getElementById('template-name'),
    templatePrompt: document.getElementById('template-prompt'),
    saveTemplateBtn: document.getElementById('save-template-btn'),
    cancelTemplateBtn: document.getElementById('cancel-template-btn'),
    saveStatus: document.getElementById('save-status'),
    debugBtn: document.getElementById('debug-btn')
  };

  let templates = [];
  let activeTemplateId = '';

  function loadState() {
    return new Promise((resolve) => {
      chrome.storage.sync.get([
        'promptTemplates', 'activeTemplateId',
        'customSystemPrompt' // legacy: migrate if exists
      ], (result) => {
        if (result.promptTemplates && result.promptTemplates.length > 0) {
          templates = result.promptTemplates;
        } else if (result.customSystemPrompt) {
          // Migrate from old single-prompt to template system
          templates = [
            { id: 'migrated', name: '自定义', prompt: result.customSystemPrompt },
            ...DEFAULT_TEMPLATES.filter(t => t.id !== 'default')
          ];
        } else {
          templates = JSON.parse(JSON.stringify(DEFAULT_TEMPLATES));
        }
        activeTemplateId = result.activeTemplateId || templates[0].id;
        resolve();
      });
    });
  }

  function saveTemplates() {
    chrome.storage.sync.set({
      promptTemplates: templates,
      activeTemplateId: activeTemplateId
    });
  }

  function renderTemplates() {
    // Render dropdown
    elements.activeTemplate.innerHTML = '';
    templates.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.name;
      if (t.id === activeTemplateId) opt.selected = true;
      elements.activeTemplate.appendChild(opt);
    });

    // Render list
    elements.templateList.innerHTML = '';
    templates.forEach(t => {
      const item = document.createElement('div');
      item.className = 'template-item' + (t.id === activeTemplateId ? ' active' : '');

      const preview = t.prompt.replace(/\n/g, ' ').substring(0, 60) + '...';
      item.innerHTML = `
        <span class="tpl-name">${escapeHtml(t.name)}</span>
        <span class="tpl-preview" title="${escapeHtml(t.prompt.substring(0, 200))}">${escapeHtml(preview)}</span>
        <div class="tpl-actions">
          <button class="edit-tpl" data-id="${t.id}">编辑</button>
          <button class="delete-tpl" data-id="${t.id}">删除</button>
        </div>
      `;
      elements.templateList.appendChild(item);
    });

    // Bind edit/delete
    elements.templateList.querySelectorAll('.edit-tpl').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = templates.find(x => x.id === btn.dataset.id);
        if (t) {
          elements.editTemplateId.value = t.id;
          elements.templateName.value = t.name;
          elements.templatePrompt.value = t.prompt;
          elements.templateEditor.style.display = 'block';
        }
      });
    });
    elements.templateList.querySelectorAll('.delete-tpl').forEach(btn => {
      btn.addEventListener('click', () => {
        if (templates.length <= 1) {
          showStatus('至少保留一个模板', 'error');
          return;
        }
        templates = templates.filter(x => x.id !== btn.dataset.id);
        if (activeTemplateId === btn.dataset.id) {
          activeTemplateId = templates[0].id;
        }
        saveTemplates();
        renderTemplates();
        showStatus('模板已删除', 'success');
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Active template change
  elements.activeTemplate.addEventListener('change', () => {
    activeTemplateId = elements.activeTemplate.value;
    saveTemplates();
    renderTemplates();
    showStatus('已切换到: ' + templates.find(t => t.id === activeTemplateId).name, 'success');
  });

  // Add new template
  elements.addTemplateBtn.addEventListener('click', () => {
    elements.editTemplateId.value = '';
    elements.templateName.value = '';
    elements.templatePrompt.value = '';
    elements.templateEditor.style.display = 'block';
  });

  // Cancel editing
  elements.cancelTemplateBtn.addEventListener('click', () => {
    elements.templateEditor.style.display = 'none';
  });

  // Save template
  elements.saveTemplateBtn.addEventListener('click', () => {
    const name = elements.templateName.value.trim();
    const prompt = elements.templatePrompt.value.trim();
    if (!name) {
      showStatus('请填写模板名称', 'error');
      return;
    }
    if (!prompt) {
      showStatus('请填写提示词内容', 'error');
      return;
    }

    const editId = elements.editTemplateId.value;
    if (editId) {
      const t = templates.find(x => x.id === editId);
      if (t) {
        t.name = name;
        t.prompt = prompt;
      }
    } else {
      templates.push({
        id: 'tpl-' + Date.now(),
        name: name,
        prompt: prompt
      });
    }

    elements.templateEditor.style.display = 'none';
    saveTemplates();
    renderTemplates();
    showStatus('模板已保存', 'success');
  });

  // Debug button
  if (elements.debugBtn) {
    elements.debugBtn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ action: 'getDebugLogs' }, (logs) => {
        if (chrome.runtime.lastError) {
          console.error('Error getting debug logs:', chrome.runtime.lastError);
          return;
        }
        console.log('=== Text Structify Debug Logs ===');
        console.log('Time:', new Date().toISOString());
        if (logs && logs.length > 0) {
          logs.forEach(log => {
            console.log(`[${log.timestamp}] [${log.context}] ${log.message}`,
              log.data ? JSON.parse(log.data) : '');
          });
          const debugText = logs.map(log =>
            `[${log.timestamp}] [${log.context}] ${log.message} ${log.data || ''}`
          ).join('\n');
          navigator.clipboard.writeText(debugText).then(() => {
            showStatus('调试日志已复制到剪贴板', 'success');
          }).catch(() => {
            showStatus('日志已输出到控制台 (F12)', 'success');
          });
        } else {
          console.log('No debug logs found');
          showStatus('无调试日志', 'success');
        }
        console.log('=== End Debug Logs ===');
      });
    });
  }

  function showStatus(message, type) {
    elements.saveStatus.textContent = message;
    elements.saveStatus.className = `save-status ${type}`;
    elements.saveStatus.style.display = 'block';
    setTimeout(() => { elements.saveStatus.style.display = 'none'; }, 3000);
  }

  // Init
  await loadState();
  renderTemplates();
});
