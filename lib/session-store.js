import crypto from 'node:crypto';

const sessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return structuredClone(value);
}

function deriveTitle(content) {
  const collapsed = String(content || '').replace(/\s+/g, ' ').trim();
  if (!collapsed) {
    return '新会话';
  }
  return collapsed.slice(0, 24);
}

export function createSession(title = '新会话') {
  const session = {
    id: crypto.randomUUID(),
    title,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [],
  };
  sessions.set(session.id, session);
  return clone(session);
}

export function getSession(sessionId) {
  const session = sessions.get(sessionId);
  return session ? clone(session) : null;
}

export function listSessions() {
  return Array.from(sessions.values())
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .map(clone);
}

export function appendMessage(sessionId, messageInput) {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  const message = {
    id: crypto.randomUUID(),
    role: messageInput.role || 'user',
    content: String(messageInput.content || '').trim(),
    meta: messageInput.meta || null,
    createdAt: nowIso(),
  };

  if (!message.content) {
    return null;
  }

  session.messages.push(message);
  if (session.title === '新会话' || session.title === '默认会话') {
    if (message.role === 'user') {
      session.title = deriveTitle(message.content);
    }
  }
  session.updatedAt = nowIso();
  return clone(message);
}

export function getRecentMessages(sessionId, limit = 6) {
  const session = sessions.get(sessionId);
  if (!session) {
    return [];
  }
  return session.messages.slice(-Math.max(0, limit)).map(clone);
}
