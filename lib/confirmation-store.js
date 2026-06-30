import crypto from 'node:crypto';

const requests = new Map();

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return structuredClone(value);
}

export function createConfirmation(input) {
  const request = {
    id: crypto.randomUUID(),
    status: 'pending',
    originalPrompt: String(input.originalPrompt || ''),
    promptToEnhance: String(input.promptToEnhance || ''),
    enhancedPrompt: String(input.enhancedPrompt || ''),
    provider: input.provider || '',
    model: input.model || '',
    warning: input.warning || '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  requests.set(request.id, request);
  return clone(request);
}

export function getConfirmation(id) {
  const request = requests.get(id);
  return request ? clone(request) : null;
}

export function resolveConfirmation(id, status, enhancedPrompt) {
  const request = requests.get(id);
  if (!request || request.status !== 'pending') {
    return null;
  }
  request.status = status;
  if (typeof enhancedPrompt === 'string') {
    request.enhancedPrompt = enhancedPrompt;
  }
  request.updatedAt = nowIso();
  return clone(request);
}

export function pruneConfirmations(maxAgeMs = 30 * 60 * 1000) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [id, request] of requests.entries()) {
    if (Date.parse(request.createdAt) < cutoff) {
      requests.delete(id);
    }
  }
}
