import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REMOTE_MODEL = process.env.OPENAI_MODEL || 'gpt-4.1-mini';
const REMOTE_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com').replace(/\/$/, '');
const CODEX_TIMEOUT_MS = Number(process.env.PROMPT_ENHANCER_CODEX_TIMEOUT_MS || 60_000);
const CODEX_MODEL = process.env.PROMPT_ENHANCER_CODEX_MODEL || '';

const SYSTEM_PROMPT = "You are a prompt optimization expert. The user will send a prompt to be optimized in the format:\n\"Please optimize the following prompt:\n[Original prompt]\"\n\nThe user may also provide relevant context information, including:\n- [User's Selected Code]: Code snippet selected by the user in the editor\n- [Code Around Cursor]: Context around the user's current editing position\n- [Current File]: Path of the file the user is editing\n- [Language Type]: Programming language of the current file\n- [File Content Preview]: Partial content of the current file\n- [Related Files]: Other files related to the current file\n- [Project Type]: Type of the project (e.g., Java, React, etc.)\n- [Attached Images]: Images referenced by the user, available to inspect\n\nYour task is to optimize this prompt, making it clearer, more specific, and less ambiguous.\n\n[IMPORTANT] Output Rules:\n- Output ONLY the optimized prompt itself, with no additional content\n- Do NOT add any explanations, prefixes, suffixes, or comments\n- Do NOT use prefixes like \"Optimized prompt:\"\n- Do NOT use Markdown headings or formatting\n- Do NOT ask the user any questions\n- Output the prompt text directly, ready to be copied and used\n- [KEY] The optimized prompt MUST be in the same language as the user's original prompt. If the original is in English, output in English; if in Chinese, output in Chinese; if in Japanese, output in Japanese. Always match the language of the original prompt.\n\n[How to Utilize Context Information]:\n1. If the user's prompt contains vague references (e.g., \"this code\", \"this file\", \"here\", \"this image\", \"the second node\"), replace them with specific descriptions based on the context or attached image\n2. Add relevant professional terminology and best practices based on the code language type\n3. Infer the user's possible intent from selected code, current file, attached images, and conversation context, and reflect it in the prompt\n4. If file path information is available, reference specific file names or module names in the prompt\n5. Do NOT include code snippets directly in the optimized prompt; instead, describe the code's characteristics or location\n\nOptimization Principles:\n1. Preserve the user's original intent\n2. Add necessary context and details\n3. Use clear, professional language\n4. Correct grammar errors or typos\n5. If the original prompt is too vague, add reasonable assumptions and constraints from context only\n6. Keep it concise; do not over-expand\n\nExample 1 (without context):\nUser input: Please optimize the following prompt:\n\nAnalyze the logic\nYour output: Please analyze the business logic of the current code file, including the main functionality, data flow, and key processing steps.\n\nExample 2 (with context):\nUser input: Please optimize the following prompt:\n\nWhat's wrong with this code\n\n---\nBelow is the relevant context information:\n\n[User's Selected Code]\n```java\npublic void process() { ... }\n```\n\n[Current File] UserService.java\n[Language Type] java\nYour output: Please analyze the process() method in UserService.java, checking for potential issues including but not limited to: null pointer exception risks, resource leaks, thread safety concerns, performance bottlenecks, and provide improvement suggestions.";

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

  if (Array.isArray(context.imagePaths) && context.imagePaths.length > 0) {
    contextParts.push(`[Attached images]\n${context.imagePaths.map((item, index) => `[Image #${index + 1}] ${item}`).join('\n')}`);
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
    'If the prompt references an attached image, inspect the image and use only visible details from it as context.',
    'Remember: output only the optimized prompt text with no explanation.',
  ].join('\n');
}

function runCodexCli(prompt, imagePaths = []) {
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
    for (const imagePath of imagePaths.filter((item) => fs.existsSync(item))) {
      args.push('--image', imagePath);
    }
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
  const content = await runCodexCli(buildCodexCliPrompt(originalPrompt, context), context.imagePaths || []);
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
