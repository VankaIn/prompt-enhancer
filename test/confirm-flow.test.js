import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';

const serverPath = path.resolve('server.js');
const host = '127.0.0.1';
const port = 4199;
const base = `http://${host}:${port}`;

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitReady() {
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${base}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await sleep(100);
  }
  return false;
}

test('server stores the in-session enhanced prompt verbatim and confirms it', async () => {
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, HOST: host, PORT: String(port) },
    stdio: 'ignore',
  });

  try {
    assert.ok(await waitReady(), 'server did not start');

    const enhanced = 'Enhanced by Claude:\nfix login bug in auth.js';
    const created = await (await fetch(`${base}/api/confirmations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ originalPrompt: '修登录', enhancedPrompt: enhanced }),
    })).json();

    const id = created.request.id;
    // server must NOT rewrite the prompt — it only stores + displays it
    assert.equal(created.request.enhancedPrompt, enhanced);
    assert.equal(created.request.status, 'pending');
    assert.equal(created.request.provider, 'claude-session');

    // user edits + confirms on the page
    const edited = `${enhanced} (edited)`;
    const confirmed = await (await fetch(`${base}/api/confirmations/${id}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enhancedPrompt: edited }),
    })).json();

    assert.equal(confirmed.request.status, 'confirmed');
    assert.equal(confirmed.request.enhancedPrompt, edited);
  } finally {
    child.kill('SIGTERM');
  }
});
