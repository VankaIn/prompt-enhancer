// 逐字原文的落盘/读取。UserPromptSubmit hook 写入，confirm 命令消费。
// hook 脚本是自包含单文件（会被复制到 ~/.prompt-enhancer/hook.js 独立运行），
// 其 TMP_FILE 与触发词在 bin/prompt-enhancer-hook.js 里内联，必须与此处保持一致。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ponytail: 全局单文件，多会话并发调用会串；per-session 文件等真出问题再拆。
export const TMP_FILE = path.join(os.tmpdir(), 'prompt-enhancer-original.txt');
export const MAX_AGE_MS = 10 * 60 * 1000;
const TRIGGER = /prompt-enhancer/i;

export function hasTrigger(text) {
  return TRIGGER.test(String(text || ''));
}

export function writeOriginal(text) {
  fs.writeFileSync(TMP_FILE, String(text), 'utf8');
}

// 读取新鲜的落盘原文并删除文件；无文件或已过期返回 null（调用方回退到 AI 兜底）。
// 总是删除，避免陈旧原文被下次调用误复用。
export function consumeOriginal(maxAgeMs = MAX_AGE_MS) {
  let text;
  let ageMs;
  try {
    const stat = fs.statSync(TMP_FILE);
    ageMs = Date.now() - stat.mtimeMs;
    text = fs.readFileSync(TMP_FILE, 'utf8');
    fs.unlinkSync(TMP_FILE);
  } catch {
    return null;
  }
  return ageMs > maxAgeMs ? null : text;
}
