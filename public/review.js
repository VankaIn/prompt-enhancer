const requestId = location.pathname.split('/').filter(Boolean).pop();

const elements = {
  statusLine: document.querySelector('#status-line'),
  originalPrompt: document.querySelector('#original-prompt'),
  enhancedPrompt: document.querySelector('#enhanced-prompt'),
  enhancerMeta: document.querySelector('#enhancer-meta'),
  confirmButton: document.querySelector('#confirm-button'),
  cancelButton: document.querySelector('#cancel-button'),
};

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
  if (!response.ok) throw new Error(data.error || `request failed: ${response.status}`);
  return data;
}

async function loadRequest() {
  const data = await requestJson(`/api/confirmations/${encodeURIComponent(requestId)}`);
  const request = data.request;
  elements.originalPrompt.textContent = request.promptToEnhance || request.originalPrompt || '';
  elements.enhancedPrompt.value = request.enhancedPrompt || '';

  const meta = [];
  if (request.provider) meta.push(`provider: ${request.provider}`);
  if (request.model) meta.push(`model: ${request.model}`);
  if (request.warning) meta.push(`warning: ${request.warning}`);
  elements.enhancerMeta.textContent = meta.join(' | ') || '确认后才会交给 AI。';

  const done = request.status !== 'pending';
  elements.confirmButton.disabled = done;
  elements.cancelButton.disabled = done;
  setStatus(done ? `已${request.status === 'confirmed' ? '确认' : '取消'}` : '等待确认');
}

async function resolve(status) {
  const enhancedPrompt = elements.enhancedPrompt.value.trim();
  if (status === 'confirm' && !enhancedPrompt) {
    setStatus('增强后的提示词不能为空');
    return;
  }

  elements.confirmButton.disabled = true;
  elements.cancelButton.disabled = true;
  await requestJson(`/api/confirmations/${encodeURIComponent(requestId)}/${status}`, {
    method: 'POST',
    body: JSON.stringify({ enhancedPrompt }),
  });
  setStatus(status === 'confirm' ? '已确认，可以返回 AI 客户端。' : '已取消，本次不会发送。');
  elements.enhancerMeta.textContent = '这个页面可以关闭了。';
  // ponytail: window.close() only works for script-opened tabs; some browsers
  // refuse OS-opened ones, so the "page can be closed" message stays as fallback.
  setTimeout(() => window.close(), 400);
}

elements.confirmButton.addEventListener('click', () => resolve('confirm').catch((error) => setStatus(error.message)));
elements.cancelButton.addEventListener('click', () => resolve('cancel').catch((error) => setStatus(error.message)));

loadRequest().catch((error) => setStatus(error.message));
