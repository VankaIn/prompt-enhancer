import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCodexCliPrompt, buildFullPrompt, createHeuristicEnhancedPrompt } from '../lib/prompt-enhancer.js';

test('buildFullPrompt includes recent session context', () => {
  const output = buildFullPrompt('修一下登录问题', {
    sessionTitle: '登录问题排查',
    recentMessages: [
      { role: 'user', content: '接口 401 了' },
      { role: 'assistant', content: '需要先看 token 是否过期' },
    ],
  });

  assert.match(output, /\[Recent conversation context\]/);
  assert.match(output, /\[Current session\]/);
  assert.match(output, /接口 401 了/);
});

test('createHeuristicEnhancedPrompt keeps UI questions concise and actionable', () => {
  const output = createHeuristicEnhancedPrompt('帮我看一下，第二个节点不应该会有两个按钮吗?');
  assert.match(output, /第二个节点/);
  assert.match(output, /按钮渲染条件/);
  assert.match(output, /根因/);
  assert.doesNotMatch(output, /【任务目标】|【执行要求】|请直接处理下面的任务/);
});


test('buildCodexCliPrompt uses strict optimizer instructions', () => {
  const output = buildCodexCliPrompt('帮我看一下按钮问题');
  assert.match(output, /Output ONLY the optimized prompt/);
  assert.match(output, /Match the language/);
  assert.match(output, /帮我看一下按钮问题/);
});
