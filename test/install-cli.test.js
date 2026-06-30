import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = path.resolve('bin/prompt-enhancer.js');

test('install registers the skill via skills add (dry-run)', () => {
  const result = spawnSync(process.execPath, [cli, 'install', '--agent', 'all', '--dry-run'], {
    encoding: 'utf8',
    env: { ...process.env, PROMPT_ENHANCER_DRY_RUN_SKILLS: '1' },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /skills add https:\/\/github\.com\/VankaIn\/prompt-enhancer/);
  assert.match(result.stdout, /claude-code/);
  assert.match(result.stdout, /codex/);
  assert.match(result.stdout, /cursor/);
});

test('confirm requires an enhanced prompt', () => {
  const result = spawnSync(process.execPath, [cli, 'confirm', '--original', 'x'], {
    encoding: 'utf8',
    input: '',
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing enhanced prompt/);
});
