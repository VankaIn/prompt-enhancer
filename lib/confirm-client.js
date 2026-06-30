import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const host = process.env.PROMPT_ENHANCER_HOST || '127.0.0.1';
const port = Number(process.env.PROMPT_ENHANCER_PORT || process.env.PORT || 4173);
let baseUrl = makeBaseUrl(port);
const timeoutMs = Number(process.env.PROMPT_ENHANCER_CONFIRM_TIMEOUT_MS || 10 * 60 * 1000);

function makeBaseUrl(serverPort) {
  return `http://${host}:${serverPort}`;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServerReady(url = baseUrl) {
  try {
    const response = await fetch(`${url}/api/health`);
    const data = await response.json();
    return response.ok && data.app === 'prompt-enhancer' && data.features?.includes('confirmations');
  } catch {
    return false;
  }
}

async function hasHttpResponse(url = baseUrl) {
  try {
    await fetch(`${url}/api/health`);
    return true;
  } catch {
    return false;
  }
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

async function startServer(serverPort) {
  baseUrl = makeBaseUrl(serverPort);
  const child = spawn(process.execPath, [path.join(rootDir, 'server.js')], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, HOST: host, PORT: String(serverPort) },
  });
  child.unref();

  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    if (await isServerReady()) return true;
  }
  return false;
}

async function ensureServer() {
  if (await isServerReady()) return;

  // ponytail: stale 4173 servers from older installs exist; use a free port instead of killing user processes.
  const firstPort = (await hasHttpResponse()) ? await freePort() : port;
  if (await startServer(firstPort)) return;
  if (firstPort !== port && await startServer(port)) return;
  if (firstPort === port && await startServer(await freePort())) return;
  throw new Error(`prompt-enhancer server not ready: ${baseUrl}`);
}

function openBrowser(url) {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
}

async function postJson(url, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `request failed: ${response.status}`);
  return data;
}

async function getJson(url) {
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `request failed: ${response.status}`);
  return data;
}

async function waitForDecision(requestId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const data = await getJson(`${baseUrl}/api/confirmations/${encodeURIComponent(requestId)}`);
    if (data.request.status !== 'pending') return data.request;
    await sleep(500);
  }
  return null;
}

/**
 * Open the browser confirmation page for an already-enhanced prompt and block
 * until the user confirms (or edits) / cancels. The enhancement itself is done
 * by the calling Claude session; the server only stores and displays it.
 *
 * @param {string} originalPrompt the user's raw request
 * @param {string} enhancedPrompt the prompt enhanced in-session by Claude
 * @returns {Promise<string>} the confirmed (possibly user-edited) prompt
 */
export async function confirmPrompt(originalPrompt, enhancedPrompt) {
  await ensureServer();
  const created = await postJson(`${baseUrl}/api/confirmations`, {
    originalPrompt,
    enhancedPrompt,
  });

  openBrowser(created.reviewUrl);
  const decision = await waitForDecision(created.request.id);
  if (!decision) throw new Error('提示词增强确认超时，本次消息未发送。');
  if (decision.status !== 'confirmed') throw new Error('已取消提示词增强，本次消息未发送。');

  const confirmed = String(decision.enhancedPrompt || '').trim();
  if (!confirmed) throw new Error('增强后的提示词为空。');
  return confirmed;
}
