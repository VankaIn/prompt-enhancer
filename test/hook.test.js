import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { extractPrompt, extractPromptPayload } from '../bin/prompt-enhancer-hook.js';

test('extractPrompt reads UserPromptSubmit json payload', () => {
  assert.equal(extractPrompt(JSON.stringify({ prompt: '/prompt-enhance 修登录' })), '/prompt-enhance 修登录');
  assert.equal(extractPrompt(JSON.stringify({ message: '$prompt-enhance 修登录' })), '$prompt-enhance 修登录');
});

test('extractPrompt falls back to raw stdin', () => {
  assert.equal(extractPrompt('/prompt-enhance 修登录'), '/prompt-enhance 修登录');
});

test('extractPromptPayload recovers image paths from transcript', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-enhancer-hook-'));
  const image = path.join(dir, 'shot.png');
  const transcript = path.join(dir, 'rollout.jsonl');
  fs.writeFileSync(image, 'png');
  fs.writeFileSync(transcript, `${JSON.stringify({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'user',
      content: [
        { type: 'input_text', text: `<image name=[Image #1] path="${image}">` },
        { type: 'input_text', text: '$prompt-enhancer 帮我看一下按钮' },
      ],
    },
  })}\n`);

  const payload = extractPromptPayload(JSON.stringify({
    prompt: '$prompt-enhancer [Image #1]\n帮我看一下按钮',
    transcript_path: transcript,
  }));

  assert.equal(payload.prompt, '$prompt-enhancer [Image #1]\n帮我看一下按钮');
  assert.deepEqual(payload.imagePaths, [image]);
});
