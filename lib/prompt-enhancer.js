import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REMOTE_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const REMOTE_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
const CODEX_TIMEOUT_MS = Number(process.env.PROMPT_ENHANCER_CODEX_TIMEOUT_MS || 60_000);
const CODEX_MODEL = process.env.PROMPT_ENHANCER_CODEX_MODEL || '';

const SYSTEM_PROMPT = [
  'You are a prompt optimization expert.',
  'Optimize the user prompt so it is clearer, more specific, and directly executable by a coding agent.',
  'Output ONLY the optimized prompt itself: no explanations, no prefixes, no Markdown headings.',
  'Preserve the original intent. Add useful context, scope, constraints, and acceptance criteria only when they follow from the prompt or provided context.',
  'Keep it concise; do not over-expand or turn a small question into a process document.',
  'Match the language of the original prompt.',
].join('\n');

export function buildFullPrompt(originalPrompt, context = {}) {
  const prompt = String(originalPrompt || '').trim();
  let fullPrompt = [
    'Please optimize the following prompt:',
    '',
    prompt,
  ].join('\n');

  const contextParts = [];

  if (Array.isArray(context.recentMessages) && context.recentMessages.length > 0) {
    const messages = context.recentMessages
      .map((item) => `[${item.role || 'user'}] ${String(item.content || '').trim()}`)
      .filter(Boolean)
      .join('\n');
    if (messages) {
      contextParts.push(`[Recent conversation context]\n${messages}`);
    }
  }

  if (context.notes) {
    contextParts.push(`[Additional notes]\n${String(context.notes).trim()}`);
  }

  if (context.sessionTitle) {
    contextParts.push(`[Current session]\n${String(context.sessionTitle).trim()}`);
  }

  if (contextParts.length > 0) {
    fullPrompt += '\n\n---\nRelevant context information:\n\n' + contextParts.join('\n\n');
  }

  return fullPrompt;
}

function inferTaskHints(prompt) {
  const text = String(prompt || '').toLowerCase();
  return {
    codeRelated: /(代码|bug|报错|重构|实现|修复|接口|脚本|sql|review|debug|function|class)/i.test(text),
    uiRelated: /(页面|网页|弹窗|交互|前端|组件|样式|按钮|节点|ui|ux)/i.test(text),
    questionLike: /(吗|么|为什么|为何|是否|是不是|不应该|怎么|如何|why|should|is it|isn't|does it)/i.test(text),
    chinese: /[\u3400-\u9fff]/.test(text),
  };
}

function appendRecentContext(lines, recentMessages, chinese) {
  if (!recentMessages.length) return;
  const context = recentMessages
    .map((item) => `${item.role || 'user'}: ${String(item.content || '').trim()}`)
    .filter(Boolean)
    .join('；');
  if (context) {
    lines.push(chinese ? `参考最近上下文：${context}。` : `Use recent context where relevant: ${context}.`);
  }
}

export function createHeuristicEnhancedPrompt(originalPrompt, context = {}) {
  const prompt = String(originalPrompt || '').trim();
  const hints = inferTaskHints(prompt);
  const recentMessages = Array.isArray(context.recentMessages) ? context.recentMessages.slice(-3) : [];

  if (hints.chinese) {
    const lines = [];
    if (hints.uiRelated) {
      lines.push(`请检查这个页面/流程问题：「${prompt}」。确认它是预期行为还是异常；重点排查相关组件的按钮渲染条件、节点类型/状态判断、数据来源、配置以及是否存在重复渲染；如果是异常，请定位根因并给出最小修复和验证方式；如果是预期，请说明依据。`);
    } else if (hints.codeRelated || hints.questionLike) {
      lines.push(`请基于当前项目上下文检查并回答这个问题：「${prompt}」。先定位相关代码或配置，再说明根因；如果需要修改，请给出最小改动和验证方式；如果不需要修改，请说明依据。`);
    } else {
      lines.push(`请将下面需求转化为清晰、可执行的任务并直接处理：${prompt}。保留原意，明确目标、范围边界和验收方式，不要扩大需求。`);
    }
    appendRecentContext(lines, recentMessages, true);
    return lines.join('\n');
  }

  const lines = [];
  if (hints.uiRelated) {
    lines.push(`Please investigate this UI/workflow issue: "${prompt}". Determine whether the observed behavior is expected or a bug. Check the relevant component rendering conditions, node/type state checks, data/config sources, and duplicate rendering paths. If it is a bug, identify the root cause, make the smallest fix, and describe how to verify it; if it is expected, cite the evidence.`);
  } else if (hints.codeRelated || hints.questionLike) {
    lines.push(`Please investigate and answer this using the current project context: "${prompt}". Locate the relevant code or configuration, explain the root cause, and if a change is needed, provide the smallest fix plus a verification step; if no change is needed, explain why.`);
  } else {
    lines.push(`Please turn this request into a clear, executable task and handle it: "${prompt}". Preserve the original intent, clarify the goal, scope boundaries, and acceptance criteria without expanding the request.`);
  }
  appendRecentContext(lines, recentMessages, false);
  return lines.join('\n');
}


export function buildCodexCliPrompt(originalPrompt, context = {}) {
  return [
    SYSTEM_PROMPT,
    '',
    buildFullPrompt(originalPrompt, context),
    '',
    'Remember: output only the optimized prompt text with no explanation.',
  ].join('\n');
}

function runCodexCli(prompt) {
  return new Promise((resolve, reject) => {
    const outputFile = path.join(os.tmpdir(), `prompt-enhancer-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.txt`);
    const cwd = process.env.PROMPT_ENHANCER_CODEX_CWD || process.env.PWD || process.cwd();
    const args = [
      'exec',
      '--skip-git-repo-check',
      '--ephemeral',
      '--ignore-rules',
      '--sandbox', 'read-only',
      '-C', cwd,
      '--output-last-message', outputFile,
    ];
    if (CODEX_MODEL) args.push('--model', CODEX_MODEL);
    args.push('-');

    const child = spawn(process.env.PROMPT_ENHANCER_CODEX_BIN || 'codex', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PROMPT_ENHANCER_SKIP_HOOK: '1' },
    });

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`codex enhancer timed out after ${CODEX_TIMEOUT_MS}ms`));
    }, CODEX_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      try {
        const fileOutput = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8').trim() : '';
        fs.rmSync(outputFile, { force: true });
        const output = fileOutput || stdout.trim();
        if (code === 0 && output) {
          resolve(output);
          return;
        }
        reject(new Error((stderr || stdout || `codex exited with ${code}`).trim()));
      } catch (error) {
        reject(error);
      }
    });

    child.stdin.end(prompt);
  });
}

export async function enhanceWithCodexCli(originalPrompt, context = {}) {
  const content = await runCodexCli(buildCodexCliPrompt(originalPrompt, context));
  return {
    provider: 'codex-cli',
    model: CODEX_MODEL || 'codex-default',
    enhancedPrompt: content,
    warning: '',
  };
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
      temperature: 0.2,
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

  const provider = (process.env.PROMPT_ENHANCER_PROVIDER || '').toLowerCase();
  const fallback = (warning = '') => ({
    provider: 'heuristic',
    model: 'local-template',
    enhancedPrompt: createHeuristicEnhancedPrompt(cleanedPrompt, context),
    warning,
  });

  if (provider === 'heuristic') return fallback();

  if (process.env.OPENAI_API_KEY) {
    try {
      return await enhanceWithOpenAiCompatible(cleanedPrompt, context);
    } catch (error) {
      if (provider === 'openai') return fallback(error instanceof Error ? error.message : 'remote enhancer failed');
    }
  }

  if (provider !== 'openai') {
    try {
      return await enhanceWithCodexCli(cleanedPrompt, context);
    } catch (error) {
      return fallback(error instanceof Error ? error.message : 'codex enhancer failed');
    }
  }

  return fallback();
}
