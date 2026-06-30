const REMOTE_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const REMOTE_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');

const SYSTEM_PROMPT = [
  '你是一个提示词增强器。',
  '你的任务是保留用户原意，把原始问题改写成更清晰、更可执行、更适合交给编码 Agent 的提示词。',
  '补齐目标、上下文、边界、输出要求，但不要发明不存在的事实。',
  '直接输出增强后的提示词正文，不要解释。',
].join('\n');

export function buildFullPrompt(originalPrompt, context = {}) {
  const prompt = String(originalPrompt || '').trim();
  let fullPrompt = [
    '请优化下面这条用户提示词。',
    '要求：保持原意，补齐目标、约束、上下文和期望输出，直接返回优化后的提示词正文。',
    '',
    '[原始提示词]',
    prompt,
  ].join('\n');

  const contextParts = [];

  if (Array.isArray(context.recentMessages) && context.recentMessages.length > 0) {
    const messages = context.recentMessages
      .map((item) => `[${item.role || 'user'}] ${String(item.content || '').trim()}`)
      .filter(Boolean)
      .join('\n');
    if (messages) {
      contextParts.push(`[最近会话上下文]\n${messages}`);
    }
  }

  if (context.notes) {
    contextParts.push(`[补充说明]\n${String(context.notes).trim()}`);
  }

  if (context.sessionTitle) {
    contextParts.push(`[当前会话]\n${String(context.sessionTitle).trim()}`);
  }

  if (contextParts.length > 0) {
    fullPrompt += '\n\n[上下文]\n' + contextParts.join('\n\n');
  }

  return fullPrompt;
}

function inferTaskHints(prompt) {
  const text = String(prompt || '').toLowerCase();
  return {
    codeRelated: /(代码|bug|报错|重构|实现|修复|接口|脚本|sql|review|debug|function|class)/i.test(text),
    uiRelated: /(页面|网页|弹窗|交互|前端|组件|样式|ui|ux)/i.test(text),
  };
}

export function createHeuristicEnhancedPrompt(originalPrompt, context = {}) {
  const prompt = String(originalPrompt || '').trim();
  const hints = inferTaskHints(prompt);
  const recentMessages = Array.isArray(context.recentMessages) ? context.recentMessages.slice(-4) : [];

  const lines = [
    '请直接处理下面的任务，并使用中文输出。',
    '',
    '【任务目标】',
    prompt,
    '',
    '【执行要求】',
    '1. 先准确理解用户目标，保留原意，不要擅自扩大范围。',
    '2. 如果信息不足，先基于现有上下文做最合理假设，并明确写出假设。',
    '3. 结果要可直接执行或可直接交付，不要只停留在泛泛建议。',
  ];

  if (hints.codeRelated) {
    lines.push('4. 涉及代码时，先分析现状与影响范围，再给出最小可行改动。');
    lines.push('5. 如果需要改代码，优先复用现有结构、函数和约定。');
  }

  if (hints.uiRelated) {
    lines.push('4. 涉及页面交互时，说明状态流转、确认/取消行为，以及用户最终看到的结果。');
  }

  if (recentMessages.length > 0) {
    lines.push('');
    lines.push('【最近会话上下文】');
    for (const item of recentMessages) {
      lines.push(`- ${item.role || 'user'}: ${String(item.content || '').trim()}`);
    }
  }

  lines.push('');
  lines.push('【输出要求】');
  lines.push('直接给出最终结果，不要复述题目。');

  return lines.join('\n');
}

function extractTextContent(content) {
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part?.type === 'text') return part.text || '';
        return '';
      })
      .join('')
      .trim();
  }

  return '';
}

export async function enhanceWithOpenAiCompatible(originalPrompt, context = {}) {
  const response = await fetch(`${REMOTE_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: REMOTE_MODEL,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildFullPrompt(originalPrompt, context) },
      ],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`remote enhancer failed: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const content = extractTextContent(data?.choices?.[0]?.message?.content);
  if (!content) {
    throw new Error('remote enhancer returned empty content');
  }

  return {
    provider: 'openai-compatible',
    model: REMOTE_MODEL,
    enhancedPrompt: content,
    warning: '',
  };
}

export async function enhancePromptRequest({ prompt, context = {} }) {
  const cleanedPrompt = String(prompt || '').trim();
  if (!cleanedPrompt) {
    return {
      provider: 'none',
      model: '',
      enhancedPrompt: '',
      warning: '',
    };
  }

  if (process.env.OPENAI_API_KEY) {
    try {
      return await enhanceWithOpenAiCompatible(cleanedPrompt, context);
    } catch (error) {
      return {
        provider: 'heuristic',
        model: 'local-template',
        enhancedPrompt: createHeuristicEnhancedPrompt(cleanedPrompt, context),
        warning: error instanceof Error ? error.message : 'remote enhancer failed',
      };
    }
  }

  return {
    provider: 'heuristic',
    model: 'local-template',
    enhancedPrompt: createHeuristicEnhancedPrompt(cleanedPrompt, context),
    warning: '',
  };
}
