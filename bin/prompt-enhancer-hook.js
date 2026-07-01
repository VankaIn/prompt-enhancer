#!/usr/bin/env node
// UserPromptSubmit hook：捕获用户输入的逐字字节，供 confirm 作为 --original 的保真来源。
// 自包含单文件——install 会把它复制到 ~/.prompt-enhancer/hook.js 独立运行，故 TMP_FILE 与
// 触发词在此内联，必须与 lib/original-store.js 保持一致。
// 铁律：静默失败、不输出 stdout（否则会注入上下文）、绝不阻断用户输入。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TMP_FILE = path.join(os.tmpdir(), 'prompt-enhancer-original.txt');
const TRIGGER = /prompt-enhancer/i;

function readStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

// UserPromptSubmit 各家 agent 传的 JSON 字段名不一，逐个尝试；非 JSON 则整段当 prompt。
function extractPrompt(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  try {
    const json = JSON.parse(text);
    for (const key of ['prompt', 'user_prompt', 'message', 'input']) {
      if (typeof json?.[key] === 'string') return json[key];
    }
    return ''; // JSON 但无已知字段：不写盘，让 confirm 回退到 AI 兜底
  } catch {
    return text;
  }
}

try {
  const prompt = extractPrompt(readStdin());
  if (prompt && TRIGGER.test(prompt)) {
    fs.writeFileSync(TMP_FILE, prompt, 'utf8');
  }
} catch {
  // 静默：hook 绝不阻断用户输入
}
process.exit(0);
