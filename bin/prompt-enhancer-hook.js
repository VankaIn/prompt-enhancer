#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePromptEnhanceCommand } from '../shared/command-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const host = process.env.PROMPT_ENHANCER_HOST || '127.0.0.1';
const port = Number(process.env.PROMPT_ENHANCER_PORT || process.env.PORT || 4173);
const baseUrl = `http://${host}:${port}`;
const timeoutMs = Number(process.env.PROMPT_ENHANCER_CONFIRM_TIMEOUT_MS || 10 * 60 * 1000);

function readStdin() {
  if (process.stdin.isTTY) return '';
  return fs.readFileSync(0, 'utf8');
}

export function extractPrompt(input) {
  try {
    const parsed = JSON.parse(input || '{}');
    const message = parsed.message ?? parsed.content ?? parsed.prompt ?? '';
    return typeof message === 'string' ? message : JSON.stringify(message);
  } catch {
    return input || '';
  }
}

function hookOutput(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function block(reason) {
  hookOutput({ decision: 'block', reason });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReady() {
  try {
    const response = await fetch(`${baseUrl}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await isServerReady()) return;

  const child = spawn(process.execPath, [path.join(rootDir, 'server.js')], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, HOST: host, PORT: String(port) },
  });
  child.unref();

  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    if (await isServerReady()) return;
  }
  throw new Error(`prompt-enhancer server not ready: ${baseUrl}`);
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `request failed: ${response.status}`);
  return data;
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `request failed: ${response.status}`);
  return data;
}

async function waitForDecision(requestId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await getJson(`${baseUrl}/api/confirmations/${encodeURIComponent(requestId)}`);
    if (data.request.status !== 'pending') return data.request;
    await sleep(500);
  }
  return null;
}

async function main() {
  const originalPrompt = extractPrompt(readStdin()).trim();
  if (!originalPrompt) return;

  const parsed = parsePromptEnhanceCommand(originalPrompt);
  if (!parsed.matched) return;
  if (!parsed.promptToEnhance) {
    block('请输入要增强的原始问题，例如：/prompt-enhance 帮我修复登录报错');
    return;
  }

  await ensureServer();
  const created = await postJson(`${baseUrl}/api/confirmations`, {
    originalPrompt,
    promptToEnhance: parsed.promptToEnhance,
  });

  openBrowser(created.reviewUrl);
  const decision = await waitForDecision(created.request.id);
  if (!decision) {
    block('提示词增强确认超时，本次消息未发送。');
    return;
  }
  if (decision.status !== 'confirmed') {
    block('已取消提示词增强，本次消息未发送。');
    return;
  }

  const enhancedPrompt = String(decision.enhancedPrompt || '').trim();
  hookOutput({
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      updatedInput: enhancedPrompt,
      additionalContext: `<prompt-enhancer>用户已确认以下增强提示词。请忽略原始 /prompt-enhance 命令，按增强提示词执行：\n\n${enhancedPrompt}\n</prompt-enhancer>`,
    },
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    block(error instanceof Error ? error.message : 'prompt enhancer failed');
  });
}
