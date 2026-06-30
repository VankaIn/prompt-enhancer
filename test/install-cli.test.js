import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cli = path.resolve('bin/prompt-enhancer.js');

test('install merges prompt-enhancer hook into Claude settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-enhancer-'));
  const settings = path.join(dir, 'settings.json');
  fs.writeFileSync(settings, JSON.stringify({
    hooks: {
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: 'echo keep', timeout: 1 }] },
      ],
    },
  }));

  const result = spawnSync(process.execPath, [cli, 'install', '--settings', settings], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);

  const data = JSON.parse(fs.readFileSync(settings, 'utf8'));
  const commands = data.hooks.UserPromptSubmit.flatMap((entry) => entry.hooks.map((hook) => hook.command));
  assert(commands.includes('echo keep'));
  assert(commands.some((command) => command.includes('prompt-enhancer.js') && command.includes(' hook')));
});
