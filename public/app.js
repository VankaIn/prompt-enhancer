import { parsePromptEnhanceCommand } from '/shared/command-parser.js';

const elements = {
  sessionList: document.querySelector('#session-list'),
  sessionTitle: document.querySelector('#session-title'),
  statusLine: document.querySelector('#status-line'),
  messageList: document.querySelector('#message-list'),
  composerForm: document.querySelector('#composer-form'),
  composerInput: document.querySelector('#composer-input'),
  newSessionButton: document.querySelector('#new-session-button'),
  modal: document.querySelector('#enhancer-modal'),
  originalPrompt: document.querySelector('#original-prompt'),
  enhancedPrompt: document.querySelector('#enhanced-prompt'),
  enhancerMeta: document.querySelector('#enhancer-meta'),
  regenerateButton: document.querySelector('#regenerate-button'),
  cancelButton: document.querySelector('#cancel-button'),
  confirmButton: document.querySelector('#confirm-button'),
  closeModalButton: document.querySelector('#close-modal-button'),
};

const state = {
  sessions: [],
  activeSessionId: '',
  enhancer: {
    open: false,
    originalCommand: '',
    promptToEnhance: '',
    enhancedPrompt: '',
    provider: '',
    model: '',
    warning: '',
    loading: false,
  },
};

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function activeSession() {
  return state.sessions.find((item) => item.id === state.activeSessionId) || null;
}

function formatTime(value) {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function setStatus(text) {
  elements.statusLine.textContent = text;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `request failed: ${response.status}`);
  }
  return data;
}

async function loadSessions() {
  const data = await requestJson('/api/sessions');
  state.sessions = data.sessions || [];
  if (!state.activeSessionId && state.sessions[0]) {
    state.activeSessionId = state.sessions[0].id;
  }
  if (!activeSession() && state.sessions[0]) {
    state.activeSessionId = state.sessions[0].id;
  }
  render();
}

async function createSession() {
  const data = await requestJson('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ title: '新会话' }),
  });
  state.activeSessionId = data.session.id;
  await loadSessions();
  elements.composerInput.focus();
}

async function sendMessage(content, meta = null) {
  const session = activeSession();
  if (!session) {
    return;
  }

  await requestJson(`/api/sessions/${encodeURIComponent(session.id)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      role: 'user',
      content,
      meta,
    }),
  });

  await loadSessions();
}

async function startEnhancement(originalCommand, promptToEnhance) {
  state.enhancer = {
    open: true,
    originalCommand,
    promptToEnhance,
    enhancedPrompt: '',
    provider: '',
    model: '',
    warning: '',
    loading: true,
  };

  elements.composerInput.value = '';
  renderEnhancer();
  setStatus('原始命令已拦截，等待增强确认。');

  try {
    const data = await requestJson('/api/enhance', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.activeSessionId,
        prompt: promptToEnhance,
      }),
    });

    state.enhancer.enhancedPrompt = data.enhancedPrompt || '';
    state.enhancer.provider = data.provider || '';
    state.enhancer.model = data.model || '';
    state.enhancer.warning = data.warning || '';
  } catch (error) {
    state.enhancer.warning = error instanceof Error ? error.message : '增强失败';
  } finally {
    state.enhancer.loading = false;
    renderEnhancer();
  }
}

async function regenerateEnhancement() {
  if (!state.enhancer.promptToEnhance) {
    return;
  }

  state.enhancer.loading = true;
  state.enhancer.warning = '';
  renderEnhancer();

  try {
    const data = await requestJson('/api/enhance', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: state.activeSessionId,
        prompt: state.enhancer.promptToEnhance,
      }),
    });

    state.enhancer.enhancedPrompt = data.enhancedPrompt || '';
    state.enhancer.provider = data.provider || '';
    state.enhancer.model = data.model || '';
    state.enhancer.warning = data.warning || '';
  } catch (error) {
    state.enhancer.warning = error instanceof Error ? error.message : '增强失败';
  } finally {
    state.enhancer.loading = false;
    renderEnhancer();
  }
}

function closeEnhancer(restoreOriginal) {
  const originalCommand = state.enhancer.originalCommand;
  state.enhancer = {
    open: false,
    originalCommand: '',
    promptToEnhance: '',
    enhancedPrompt: '',
    provider: '',
    model: '',
    warning: '',
    loading: false,
  };
  renderEnhancer();

  if (restoreOriginal) {
    elements.composerInput.value = originalCommand;
    elements.composerInput.focus();
    setStatus('已取消增强，原始命令已恢复到输入框。');
  }
}

async function confirmEnhancement() {
  if (!state.enhancer.enhancedPrompt || state.enhancer.loading) {
    return;
  }

  const enhancedPrompt = state.enhancer.enhancedPrompt;
  closeEnhancer(false);
  await sendMessage(enhancedPrompt, {
    source: 'prompt-enhance',
  });
  setStatus('增强后的提示词已发送到当前 session。');
}

function renderSessions() {
  elements.sessionList.innerHTML = state.sessions
    .map((session) => {
      const active = session.id === state.activeSessionId ? 'active' : '';
      return `
        <button class="session-button ${active}" type="button" data-session-id="${escapeHtml(session.id)}">
          <div class="session-title">${escapeHtml(session.title)}</div>
          <div class="session-meta">${session.messages.length} 条消息 · ${formatTime(session.updatedAt)}</div>
        </button>
      `;
    })
    .join('');

  elements.sessionList.querySelectorAll('[data-session-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.activeSessionId = button.getAttribute('data-session-id') || '';
      render();
    });
  });
}

function renderMessages() {
  const session = activeSession();
  elements.sessionTitle.textContent = session?.title || '未选择会话';

  if (!session || session.messages.length === 0) {
    elements.messageList.innerHTML = '<div class="empty-state">当前会话还没有消息。</div>';
    return;
  }

  elements.messageList.innerHTML = session.messages
    .map((message) => `
      <article class="message ${escapeHtml(message.role)}">
        <div class="message-role">${escapeHtml(message.role)} · ${formatTime(message.createdAt)}</div>
        <div class="message-content">${escapeHtml(message.content)}</div>
      </article>
    `)
    .join('');
}

function renderEnhancer() {
  const enhancer = state.enhancer;
  elements.modal.classList.toggle('hidden', !enhancer.open);
  elements.modal.setAttribute('aria-hidden', String(!enhancer.open));
  elements.originalPrompt.textContent = enhancer.promptToEnhance || '';

  if (enhancer.loading) {
    elements.enhancedPrompt.textContent = '正在生成增强后的 PO...';
  } else if (enhancer.enhancedPrompt) {
    elements.enhancedPrompt.textContent = enhancer.enhancedPrompt;
  } else {
    elements.enhancedPrompt.textContent = '没有生成结果。';
  }

  const metaParts = [];
  if (enhancer.provider) {
    metaParts.push(`provider: ${enhancer.provider}`);
  }
  if (enhancer.model) {
    metaParts.push(`model: ${enhancer.model}`);
  }
  if (enhancer.warning) {
    metaParts.push(`warning: ${enhancer.warning}`);
  }
  if (!metaParts.length) {
    metaParts.push(enhancer.loading ? '正在生成...' : '确认后才会真正发送到当前 session。');
  }
  elements.enhancerMeta.textContent = metaParts.join(' | ');
  elements.confirmButton.disabled = enhancer.loading || !enhancer.enhancedPrompt;
}

function render() {
  renderSessions();
  renderMessages();
  renderEnhancer();
}

elements.composerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = elements.composerInput.value.trim();
  if (!content) {
    return;
  }

  const parsed = parsePromptEnhanceCommand(content);
  if (parsed.matched) {
    if (!parsed.promptToEnhance) {
      setStatus('请输入要增强的原始问题。');
      return;
    }
    await startEnhancement(content, parsed.promptToEnhance);
    return;
  }

  elements.composerInput.value = '';
  await sendMessage(content);
  setStatus('普通消息已发送到当前 session。');
});

elements.newSessionButton.addEventListener('click', createSession);
elements.regenerateButton.addEventListener('click', regenerateEnhancement);
elements.cancelButton.addEventListener('click', () => closeEnhancer(true));
elements.closeModalButton.addEventListener('click', () => closeEnhancer(true));
elements.confirmButton.addEventListener('click', confirmEnhancement);

loadSessions().catch((error) => {
  setStatus(error instanceof Error ? error.message : '加载失败');
});
