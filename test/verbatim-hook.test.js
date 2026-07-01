import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { TMP_FILE, consumeOriginal, writeOriginal, hasTrigger } from '../lib/original-store.js';

const hook = path.resolve('bin/prompt-enhancer-hook.js');
const cli = path.resolve('bin/prompt-enhancer.js');

function cleanup() {
  try {
    fs.unlinkSync(TMP_FILE);
  } catch {
    // already gone
  }
}

function runHook(input) {
  return spawnSync(process.execPath, [hook], { encoding: 'utf8', input });
}

test('hook writes the prompt verbatim when the trigger word is present', () => {
  cleanup();
  const raw = '700c28df-1da5-4604-a720-f492e5c6a7cb\n优化原型 claude绘画\n/prompt-enhancer';
  const result = runHook(JSON.stringify({ prompt: raw }));
  assert.equal(result.status, 0);
  // 逐字：会话 ID、错别字、/prompt-enhancer 触发词都原样保留
  assert.equal(fs.readFileSync(TMP_FILE, 'utf8'), raw);
  cleanup();
});

test('hook skips prompts without the trigger word', () => {
  cleanup();
  const result = runHook(JSON.stringify({ prompt: '随便聊聊天气' }));
  assert.equal(result.status, 0);
  assert.equal(fs.existsSync(TMP_FILE), false);
});

test('hook treats non-JSON stdin as the raw prompt', () => {
  cleanup();
  const result = runHook('plain text /prompt-enhancer');
  assert.equal(result.status, 0);
  assert.equal(fs.readFileSync(TMP_FILE, 'utf8'), 'plain text /prompt-enhancer');
  cleanup();
});

test('consumeOriginal returns content once, then deletes the file', () => {
  writeOriginal('原文字节');
  assert.equal(consumeOriginal(), '原文字节');
  assert.equal(fs.existsSync(TMP_FILE), false);
  assert.equal(consumeOriginal(), null);
});

test('consumeOriginal ignores (and removes) files older than max age', () => {
  writeOriginal('陈旧原文');
  assert.equal(consumeOriginal(-1), null); // 负阈值 → 任何文件都算过期
  assert.equal(fs.existsSync(TMP_FILE), false);
});

test('hasTrigger matches both /slash and bare forms', () => {
  assert.equal(hasTrigger('用 /prompt-enhancer'), true);
  assert.equal(hasTrigger('call prompt-enhancer now'), true);
  assert.equal(hasTrigger('无关内容'), false);
});

test('install writes the hook to claude+codex and is idempotent', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pe-home-'));
  const env = { ...process.env, HOME: home, PROMPT_ENHANCER_DRY_RUN_SKILLS: '1' };
  const run = (agent) => spawnSync(process.execPath, [cli, 'install', '--agent', agent], { encoding: 'utf8', env });

  const first = run('claude,codex');
  assert.equal(first.status, 0, first.stderr);
  assert.ok(fs.existsSync(path.join(home, '.prompt-enhancer', 'hook.js')), 'hook script copied');

  const claudeFile = path.join(home, '.claude', 'settings.json');
  const codexFile = path.join(home, '.codex', 'hooks.json');
  const countHooks = (file) =>
    JSON.parse(fs.readFileSync(file, 'utf8'))
      .hooks.UserPromptSubmit.flatMap((entry) => entry.hooks || [])
      .filter((h) => String(h.command).includes('prompt-enhancer')).length;

  assert.equal(countHooks(claudeFile), 1);
  assert.equal(countHooks(codexFile), 1);

  run('claude'); // 再装一次 → 不应产生重复
  assert.equal(countHooks(claudeFile), 1, 'idempotent: no duplicate hook');

  fs.rmSync(home, { recursive: true, force: true });
});
