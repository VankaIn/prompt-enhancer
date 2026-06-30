import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';

import { createConfirmation, getConfirmation, pruneConfirmations, resolveConfirmation } from './lib/confirmation-store.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = path.join(__dirname, 'public');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '127.0.0.1';

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
}

async function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        reject(new Error('request body too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('invalid json body'));
      }
    });
    request.on('error', reject);
  });
}

function resolveStaticFile(pathname) {
  const cleanPath = pathname === '/' ? '/review.html' : pathname;
  const relativePath = cleanPath.slice(1);
  const fullPath = path.normalize(path.join(publicDir, relativePath));

  if (!fullPath.startsWith(publicDir)) {
    return null;
  }

  return fullPath;
}

async function serveStaticFile(requestPath, response) {
  const fullPath = resolveStaticFile(requestPath);
  if (!fullPath) {
    sendJson(response, 404, { error: 'not found' });
    return;
  }

  try {
    const buffer = await readFile(fullPath);
    const contentType = mimeTypes[path.extname(fullPath)] || 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    });
    response.end(buffer);
  } catch {
    sendJson(response, 404, { error: 'not found' });
  }
}

function publicBaseUrl() {
  return `http://${host}:${port}`;
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const { pathname } = url;

  try {
    if (request.method === 'GET' && pathname === '/api/health') {
      sendJson(response, 200, { ok: true, app: 'prompt-enhancer', features: ['confirmations'] });
      return;
    }

    if (request.method === 'POST' && pathname === '/api/confirmations') {
      pruneConfirmations();
      const body = await readJsonBody(request);
      const originalPrompt = String(body.originalPrompt || body.prompt || '').trim();
      const enhancedPrompt = String(body.enhancedPrompt || '').trim();
      if (!enhancedPrompt) {
        sendJson(response, 400, { error: 'enhancedPrompt is required' });
        return;
      }

      // The enhancement is produced in-session by the calling Claude; the server
      // only stores it for display + confirmation. No model call here.
      const confirmation = createConfirmation({
        originalPrompt,
        promptToEnhance: originalPrompt,
        enhancedPrompt,
        provider: 'claude-session',
        model: 'in-session',
      });
      sendJson(response, 201, {
        request: confirmation,
        reviewUrl: `${publicBaseUrl()}/review/${confirmation.id}`,
      });
      return;
    }

    const confirmationRoute = pathname.match(/^\/api\/confirmations\/([^/]+)$/);
    if (request.method === 'GET' && confirmationRoute) {
      const requestId = decodeURIComponent(confirmationRoute[1]);
      const confirmation = getConfirmation(requestId);
      if (!confirmation) {
        sendJson(response, 404, { error: 'confirmation not found' });
        return;
      }
      sendJson(response, 200, { request: confirmation });
      return;
    }

    const confirmationActionRoute = pathname.match(/^\/api\/confirmations\/([^/]+)\/(confirm|cancel)$/);
    if (request.method === 'POST' && confirmationActionRoute) {
      const requestId = decodeURIComponent(confirmationActionRoute[1]);
      const action = confirmationActionRoute[2];
      const body = await readJsonBody(request);
      const confirmation = resolveConfirmation(
        requestId,
        action === 'confirm' ? 'confirmed' : 'cancelled',
        body.enhancedPrompt
      );
      if (!confirmation) {
        sendJson(response, 404, { error: 'pending confirmation not found' });
        return;
      }
      sendJson(response, 200, { request: confirmation });
      return;
    }

    if (request.method === 'GET' && pathname.startsWith('/review/')) {
      await serveStaticFile('/review.html', response);
      return;
    }

    await serveStaticFile(pathname, response);
  } catch (error) {
    sendJson(response, 500, {
      error: error instanceof Error ? error.message : 'internal server error',
    });
  }
});

server.listen(port, host, () => {
  console.log(`Prompt Enhancer is running at http://${host}:${port}`);
});
