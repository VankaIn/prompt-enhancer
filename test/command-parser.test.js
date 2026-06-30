import test from 'node:test';
import assert from 'node:assert/strict';

import { parsePromptEnhanceCommand } from '../shared/command-parser.js';

test('parsePromptEnhanceCommand matches slash command', () => {
  assert.deepEqual(parsePromptEnhanceCommand('/prompt-enhance 帮我优化这个问题'), {
    matched: true,
    promptToEnhance: '帮我优化这个问题',
  });
});

test('parsePromptEnhanceCommand matches dollar command', () => {
  assert.deepEqual(parsePromptEnhanceCommand('$prompt-enhance 修一下登录问题'), {
    matched: true,
    promptToEnhance: '修一下登录问题',
  });
});


test('parsePromptEnhanceCommand matches skill name alias', () => {
  assert.deepEqual(parsePromptEnhanceCommand('$prompt-enhancer 修一下登录问题'), {
    matched: true,
    promptToEnhance: '修一下登录问题',
  });
});

test('parsePromptEnhanceCommand ignores normal message', () => {
  assert.deepEqual(parsePromptEnhanceCommand('帮我修一下登录问题'), {
    matched: false,
    promptToEnhance: '',
  });
});
