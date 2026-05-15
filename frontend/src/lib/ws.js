import { storage } from './storage.js';
import { state } from './state.js';

const PING_INTERVAL = 25_000;
const MAX_BACKOFF = 30_000;

let socket = null;
let convId = null;
let reconnectTimer = null;
let pingTimer = null;
let pingCount = 0;
let backoff = 1000;
let outQueue = [];
let messageHandler = null;

export function setMessageHandler(fn) {
  messageHandler = fn;
}

export function connect(conversationId) {
  convId = conversationId;
  backoff = 1000;
  _connect();
}

export function disconnect() {
  convId = null;
  _cleanup();
}

export function sendWs(msg) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  } else {
    outQueue.push(msg);
  }
}

function _connect() {
  _cleanup();
  const token = storage.get('token');
  if (!token || !convId) return;

  const apiBase = import.meta.env.VITE_API_BASE || '';
  const wsBase = apiBase
    ? apiBase.replace(/^https?/, (m) => (m === 'https' ? 'wss' : 'ws'))
    : `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
  const url = `${wsBase}/ws?token=${encodeURIComponent(token)}&conversation_id=${convId}`;
  socket = new WebSocket(url);

  socket.addEventListener('open', () => {
    backoff = 1000;
    _flushQueue();
    _startPing();
  });

  socket.addEventListener('message', (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === 'pong') { pingCount = 0; return; }
      if (msg.type === 'ping') { sendWs({ type: 'pong' }); return; }
      if (messageHandler) messageHandler(msg);
    } catch {}
  });

  socket.addEventListener('close', () => _scheduleReconnect());
  socket.addEventListener('error', () => _scheduleReconnect());
}

function _startPing() {
  clearInterval(pingTimer);
  pingCount = 0;
  pingTimer = setInterval(() => {
    pingCount++;
    if (pingCount > 2) { _connect(); return; }
    sendWs({ type: 'ping' });
  }, PING_INTERVAL);
}

function _flushQueue() {
  while (outQueue.length) {
    const msg = outQueue.shift();
    socket.send(JSON.stringify(msg));
  }
}

function _scheduleReconnect() {
  _cleanup();
  if (!convId) return;
  reconnectTimer = setTimeout(() => {
    backoff = Math.min(backoff * 2, MAX_BACKOFF);
    _connect();
  }, backoff);
}

function _cleanup() {
  clearInterval(pingTimer);
  clearTimeout(reconnectTimer);
  if (socket) {
    socket.onclose = null;
    socket.onerror = null;
    socket.close();
    socket = null;
  }
}

// Реконнект при возврате на страницу
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && convId && (!socket || socket.readyState !== WebSocket.OPEN)) {
    _connect();
  }
});
