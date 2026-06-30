import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = path.resolve('bin/prompt-enhancer.js');

function tmpSettings(seed = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-enhancer-'));
  const settings = path.join(dir, 'settings.json');
  fs.writeFileSync(settings, JSON.stringify(seed));
  return settings;
}

function runInstall(args) {
  const result = spawnSync(process.execPath, [cli, 'install', ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('install merges prompt-enhancer hook into Claude settings', () => {
  const settings = tmpSettings({
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'echo keep', timeout: 1 }] },
      ],
    },
  });

  runInstall(['--settings', settings]);

  const data = JSON.parse(fs.readFileSync(settings, 'utf8'));
  const commands = data.hooks.UserPromptSubmit.flatMap((entry) => entry.hooks.map((hook) => hook.command));
  assert(commands.includes('echo keep'));
  assert(commands.some((command) => command === 'npx -y github:VankaIn/prompt-enhancer hook'));
});

test('install can write Codex hook format', () => {
  const settings = tmpSettings();
  runInstall(['--agent', 'codex', '--settings', settings]);
  const data = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(data.hooks.UserPromptSubmit[0].hooks[0].command, 'npx -y github:VankaIn/prompt-enhancer hook');
});

test('install can write Cursor hook format', () => {
  const settings = tmpSettings({ version: 1, hooks: { beforeSubmitPrompt: [{ command: 'echo keep' }] } });
  runInstall(['--agent', 'cursor', '--settings', settings]);
  const data = JSON.parse(fs.readFileSync(settings, 'utf8'));
  assert.equal(data.hooks.beforeSubmitPrompt[0].command, 'echo keep');
  assert.equal(data.hooks.beforeSubmitPrompt[1].command, 'npx -y github:VankaIn/prompt-enhancer hook');
});
