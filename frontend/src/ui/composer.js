import { api } from '../lib/api.js';
import { state } from '../lib/state.js';
import { sendWs } from '../lib/ws.js';
import { encryptMessage, importPublicKeyField } from '../lib/crypto.js';
import { startVoiceRecording } from './voice-recorder.js';
import { openVideoRecorder } from './video-recorder.js';

export function renderComposer(convId) {
  const wrap = document.createElement('div');
  wrap.className = 'composer';

  /* ── Attach button (left) ── */
  const attachBtn = document.createElement('button');
  attachBtn.className = 'composer-attach-btn';
  attachBtn.title = 'Attach file';
  attachBtn.innerHTML = iconAttach();

  /* ── Input wrapper ── */
  const inputWrap = document.createElement('div');
  inputWrap.className = 'composer-input-wrap';

  const textarea = document.createElement('textarea');
  textarea.className = 'composer-textarea';
  textarea.placeholder = 'Message...';
  textarea.rows = 1;

  inputWrap.appendChild(textarea);

  /* ── Right side buttons ── */
  const rightWrap = document.createElement('div');
  rightWrap.className = 'composer-right';

  /* Media button (mic ↔ cam) */
  const mediaBtn = document.createElement('button');
  mediaBtn.className = 'composer-media-btn';

  /* Send button */
  const sendBtn = document.createElement('button');
  sendBtn.className = 'composer-send-btn';
  sendBtn.title = 'Send';
  sendBtn.innerHTML = iconSend();

  rightWrap.append(mediaBtn, sendBtn);
  wrap.append(attachBtn, inputWrap, rightWrap);

  /* ── State ── */
  let mediaMode = 'mic'; // 'mic' | 'cam'
  let hasText = false;

  function setMode(mode) {
    mediaMode = mode;
    mediaBtn.innerHTML = mode === 'mic' ? iconMic() : iconCam();
    mediaBtn.title = mode === 'mic'
      ? 'Voice message (hold) / tap for camera'
      : 'Video circle / tap for mic';
  }
  setMode('mic');

  /* Animate mic → send / send → mic transition */
  function updateButtons(animate) {
    if (hasText) {
      if (animate) sendBtn.style.transform = 'scale(0.7)';
      mediaBtn.style.display = 'none';
      sendBtn.style.display = 'flex';
      if (animate) requestAnimationFrame(() => { sendBtn.style.transform = ''; });
    } else {
      mediaBtn.style.display = 'flex';
      sendBtn.style.display = 'none';
    }
  }

  sendBtn.style.transition = 'transform 150ms ease, opacity 150ms ease, background 150ms ease';
  updateButtons(false);

  /* ── Textarea auto-resize ── */
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
    sendWs({ type: 'typing' });
    const newHasText = textarea.value.trim().length > 0;
    if (newHasText !== hasText) {
      hasText = newHasText;
      updateButtons(true);
    }
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });

  sendBtn.addEventListener('click', sendText);

  /* ── Media button: hold for mic, tap to switch mode, cam tap opens recorder ── */
  let holdTimer = null;
  let didHold = false;
  let isTouchEvent = false;
  let justSwitchedToCam = false;

  function onMediaDown(e) {
    e.preventDefault();
    didHold = false;
    isTouchEvent = e.type === 'touchstart';
    const delay = mediaMode === 'mic' ? 280 : 600;
    holdTimer = setTimeout(() => {
      didHold = true;
      if (mediaMode === 'mic') {
        startVoiceRecording(wrap, textarea, mediaBtn, sendBtn, attachBtn, onSendMedia);
      } else {
        setMode('mic');
      }
    }, delay);
  }

  function onMediaUp(e) {
    e.preventDefault();
    clearTimeout(holdTimer);
    if (didHold) return;
    if (mediaMode === 'mic') {
      justSwitchedToCam = true;
      setMode('cam');
      if (isTouchEvent) justSwitchedToCam = false;
    } else if (isTouchEvent) {
      openVideoRecorder(onSendMedia);
    }
  }

  function onMediaClick() {
    if (justSwitchedToCam) { justSwitchedToCam = false; return; }
    if (mediaMode === 'cam' && !didHold) openVideoRecorder(onSendMedia);
  }

  mediaBtn.addEventListener('mousedown', onMediaDown);
  mediaBtn.addEventListener('mouseup', onMediaUp);
  mediaBtn.addEventListener('touchstart', onMediaDown, { passive: false });
  mediaBtn.addEventListener('touchend', onMediaUp, { passive: false });
  mediaBtn.addEventListener('click', onMediaClick);

  function onSendMedia(mediaObj) {
    sendMessage(JSON.stringify(mediaObj), convId);
  }

  async function sendText() {
    const content = textarea.value.trim();
    if (!content) return;
    textarea.value = '';
    textarea.style.height = 'auto';
    hasText = false;
    updateButtons(true);
    await sendMessage(content, convId);
  }

  return wrap;
}

/* ── Send message with optimistic update ── */
async function sendMessage(content, convId) {
  const tmpId = 'tmp_' + Date.now();
  const now = Math.floor(Date.now() / 1000);
  const optimistic = {
    id: tmpId,
    conversation_id: convId,
    sender_id: state.user.id,
    content,
    created_at: now,
    status: 'pending',
    _decrypted: true,
  };

  const prev = state.messages[convId] || [];
  state.messages = { ...state.messages, [convId]: [optimistic, ...prev] };

  try {
    const body = await buildMessageBody(content, convId);
    const data = await api.post(`/conversations/${convId}/messages`, body);
    const msgs = state.messages[convId] || [];
    state.messages = {
      ...state.messages,
      [convId]: msgs.map(m =>
        m.id === tmpId
          ? { ...data.message, status: 'sent', _decrypted: true, content }
          : m
      ),
    };
  } catch {
    const msgs = state.messages[convId] || [];
    state.messages = {
      ...state.messages,
      [convId]: msgs.map(m => m.id === tmpId ? { ...m, status: 'failed' } : m),
    };
  }
}

async function buildMessageBody(content, convId) {
  /* Media payloads bypass encryption */
  if (content.startsWith('{"t":"')) return { content };

  const myKeyPair = state.myKeyPair;
  if (!myKeyPair) return { content };

  const conv = state.conversations.find(c => c.id === convId);
  if (!conv || conv.type !== 'direct') return { content };

  const other = conv.members?.find(m => m.id !== state.user.id);
  if (!other?.public_key) return { content };

  try {
    const theirPublicKey = await importPublicKeyField(other.public_key);
    if (!theirPublicKey) return { content };
    const encrypted = await encryptMessage(content, myKeyPair.privateKey, theirPublicKey);
    return { content: encrypted.content, nonce: encrypted.nonce };
  } catch {
    return { content };
  }
}

/* ── Icons ── */
const iconSend = () => `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <line x1="2" y1="9" x2="16" y2="9"/><polyline points="10 3 16 9 10 15"/>
</svg>`;

const iconMic = () => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <rect x="7" y="1" width="6" height="11" rx="3"/>
  <path d="M3 10a7 7 0 0 0 14 0"/>
  <line x1="10" y1="17" x2="10" y2="19"/>
  <line x1="7" y1="19" x2="13" y2="19"/>
</svg>`;

const iconCam = () => `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M1 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7z"/>
  <circle cx="10" cy="11" r="3"/>
  <path d="M7 5l1.5-2h3L13 5"/>
</svg>`;

const iconAttach = () => `<svg width="22" height="22" viewBox="0 0 22 22" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12.5l-9.5 9.5a6 6 0 0 1-8.5-8.5L13 3a4 4 0 0 1 5.7 5.6L8.5 19A2 2 0 0 1 5.6 16L14 7.5"/>
</svg>`;
