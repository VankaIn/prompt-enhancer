import test from 'node:test';
import assert from 'node:assert/strict';

import { extractPrompt } from '../bin/prompt-enhancer-hook.js';

test('extractPrompt reads UserPromptSubmit json payload', () => {
  assert.equal(extractPrompt(JSON.stringify({ prompt: '/prompt-enhance 修登录' })), '/prompt-enhance 修登录');
  assert.equal(extractPrompt(JSON.stringify({ message: '$prompt-enhance 修登录' })), '$prompt-enhance 修登录');
});

test('extractPrompt falls back to raw stdin', () => {
  assert.equal(extractPrompt('/prompt-enhance 修登录'), '/prompt-enhance 修登录');
});
