#!/usr/bin/env node
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parsePromptEnhanceCommand } from '../shared/command-parser.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const host = process.env.PROMPT_ENHANCER_HOST || '127.0.0.1';
const port = Number(process.env.PROMPT_ENHANCER_PORT || process.env.PORT || 4173);
let baseUrl = makeBaseUrl(port);
const timeoutMs = Number(process.env.PROMPT_ENHANCER_CONFIRM_TIMEOUT_MS || 10 * 60 * 1000);

function readStdin() {
  if (process.stdin.isTTY) return '';
  return fs.readFileSync(0, 'utf8');
}

function existingImagePath(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/^file:\/\//, '');
  if (!/\.(png|jpe?g|webp|gif)$/i.test(cleaned)) return '';
  return fs.existsSync(cleaned) ? cleaned : '';
}

function imagePathsFromText(text) {
  const paths = [];
  const source = String(text || '');
  for (const match of source.matchAll(/<image[^>]*\bpath=["']([^"']+)["'][^>]*>/g)) {
    const path = existingImagePath(match[1]);
    if (path) paths.push(path);
  }
  for (const match of source.matchAll(/image file:\s*([^\n]+)/gi)) {
    const path = existingImagePath(match[1].trim());
    if (path) paths.push(path);
  }
  return paths;
}

function collectImagePaths(value, paths = []) {
  if (typeof value === 'string') {
    paths.push(...imagePathsFromText(value));
    const path = existingImagePath(value);
    if (path) paths.push(path);
    return paths;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectImagePaths(item, paths);
    return paths;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectImagePaths(item, paths);
  }
  return paths;
}

function readTranscriptImagePaths(file) {
  if (!file || !fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').slice(-80).reverse();
  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      const payload = event.payload || event;
      const message = payload.payload || payload;
      if (message?.role === 'user' || message?.type === 'user_message' || message?.type === 'message') {
        const paths = collectImagePaths(message);
        if (paths.length) return paths;
      }
    } catch {
      // ignore malformed transcript lines
    }
  }
  return [];
}

function uniq(items) {
  return [...new Set(items.filter(Boolean))];
}

export function extractPromptPayload(input) {
  try {
    const parsed = JSON.parse(input || '{}');
    const message = parsed.message ?? parsed.content ?? parsed.prompt ?? '';
    const prompt = typeof message === 'string' ? message : JSON.stringify(message);
    const transcriptPath = parsed.transcript_path || parsed.transcriptPath || parsed.agent_transcript_path;
    return {
      prompt,
      imagePaths: uniq([
        ...collectImagePaths(parsed),
        ...readTranscriptImagePaths(transcriptPath),
      ]),
    };
  } catch {
    return {
      prompt: input || '',
      imagePaths: collectImagePaths(input),
    };
  }
}

export function extractPrompt(input) {
  return extractPromptPayload(input).prompt;
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

function makeBaseUrl(serverPort) {
  return `http://${host}:${serverPort}`;
}

async function isServerReady(url = baseUrl) {
  try {
    const response = await fetch(`${url}/api/health`);
    const data = await response.json();
    return response.ok && data.app === 'prompt-enhancer' && data.features?.includes('confirmations');
  } catch {
    return false;
  }
}

async function hasHttpResponse(url = baseUrl) {
  try {
    await fetch(`${url}/api/health`);
    return true;
  } catch {
    return false;
  }
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function startServer(serverPort) {
  baseUrl = makeBaseUrl(serverPort);
  const child = spawn(process.execPath, [path.join(rootDir, 'server.js')], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, HOST: host, PORT: String(serverPort) },
  });
  child.unref();

  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    if (await isServerReady()) return true;
  }
  return false;
}

async function ensureServer() {
  if (await isServerReady()) return;

  // ponytail: stale 4173 servers from older installs exist; use a free port instead of killing user processes.
  const firstPort = (await hasHttpResponse()) ? await freePort() : port;
  if (await startServer(firstPort)) return;
  if (firstPort !== port && await startServer(port)) return;
  if (firstPort === port && await startServer(await freePort())) return;
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

export async function confirmPrompt(originalPrompt, promptToEnhance, context = {}) {
  await ensureServer();
  const created = await postJson(`${baseUrl}/api/confirmations`, {
    originalPrompt,
    promptToEnhance,
    ...context,
  });

  openBrowser(created.reviewUrl);
  const decision = await waitForDecision(created.request.id);
  if (!decision) throw new Error('提示词增强确认超时，本次消息未发送。');
  if (decision.status !== 'confirmed') throw new Error('已取消提示词增强，本次消息未发送。');

  const enhancedPrompt = String(decision.enhancedPrompt || '').trim();
  if (!enhancedPrompt) throw new Error('增强后的提示词为空。');
  return enhancedPrompt;
}

async function main() {
  if (process.env.PROMPT_ENHANCER_SKIP_HOOK === '1') return;

  const payload = extractPromptPayload(readStdin());
  const originalPrompt = payload.prompt.trim();
  if (!originalPrompt) return;

  const parsed = parsePromptEnhanceCommand(originalPrompt);
  if (!parsed.matched) return;
  if (!parsed.promptToEnhance) {
    block('请输入要增强的原始问题，例如：/prompt-enhance 帮我修复登录报错');
    return;
  }

  const enhancedPrompt = await confirmPrompt(originalPrompt, parsed.promptToEnhance, { imagePaths: payload.imagePaths });
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
