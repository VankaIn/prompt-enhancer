import test from 'node:test';
import assert from 'node:assert/strict';

import { createConfirmation, getConfirmation, resolveConfirmation } from '../lib/confirmation-store.js';

test('confirmation request resolves confirmed prompt', () => {
  const created = createConfirmation({
    originalPrompt: '/prompt-enhance 修登录',
    promptToEnhance: '修登录',
    enhancedPrompt: '请修复登录问题',
  });

  assert.equal(getConfirmation(created.id).status, 'pending');

  const resolved = resolveConfirmation(created.id, 'confirmed', '请分析并修复登录问题');
  assert.equal(resolved.status, 'confirmed');
  assert.equal(resolved.enhancedPrompt, '请分析并修复登录问题');
});

test('resolved confirmation cannot be changed again', () => {
  const created = createConfirmation({ promptToEnhance: '修登录', enhancedPrompt: '请修复登录问题' });
  resolveConfirmation(created.id, 'cancelled');
  assert.equal(resolveConfirmation(created.id, 'confirmed'), null);
});
