import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFullPrompt, createHeuristicEnhancedPrompt } from '../lib/prompt-enhancer.js';

test('buildFullPrompt includes recent session context', () => {
  const output = buildFullPrompt('修一下登录问题', {
    sessionTitle: '登录问题排查',
    recentMessages: [
      { role: 'user', content: '接口 401 了' },
      { role: 'assistant', content: '需要先看 token 是否过期' },
    ],
  });

  assert.match(output, /\[最近会话上下文\]/);
  assert.match(output, /\[当前会话\]/);
  assert.match(output, /接口 401 了/);
});

test('createHeuristicEnhancedPrompt keeps original intent', () => {
  const output = createHeuristicEnhancedPrompt('帮我分析这个页面弹窗为什么不显示');
  assert.match(output, /【任务目标】/);
  assert.match(output, /帮我分析这个页面弹窗为什么不显示/);
  assert.match(output, /【输出要求】/);
});
