import { api } from '../lib/api.js';
import { state } from '../lib/state.js';
import { sendWs } from '../lib/ws.js';
import { encryptMessage, importPublicKeyField } from '../lib/crypto.js';
import { startVoiceRecording } from './voice-recorder.js';
import { openVideoRecorder } from './video-recorder.js';

export function renderComposer(convId) {
  const wrap = document.createElement('div');
  wrap.className = 'composer';

  const textarea = document.createElement('textarea');
  textarea.className = 'composer-textarea';
  textarea.placeholder = 'Message...';
  textarea.rows = 1;

  // Right-side button: send (when text) or media (mic/cam)
  const sendBtn = document.createElement('button');
  sendBtn.className = 'composer-send-btn';
  sendBtn.innerHTML = iconSend();

  // Media button (mic ↔ camera toggle)
  const mediaBtn = document.createElement('button');
  mediaBtn.className = 'composer-media-btn';
  mediaBtn.title = 'Voice message';

  let mediaMode = 'mic'; // 'mic' | 'cam'
  let hasText = false;

  function setMode(mode) {
    mediaMode = mode;
    mediaBtn.innerHTML = mode === 'mic' ? iconMic() : iconCam();
    mediaBtn.title = mode === 'mic' ? 'Voice message (hold) / tap for camera' : 'Video circle / tap for mic';
  }
  setMode('mic');

  function updateButtons() {
    if (hasText) {
      sendBtn.style.display = 'flex';
      mediaBtn.style.display = 'none';
    } else {
      sendBtn.style.display = 'none';
      mediaBtn.style.display = 'flex';
    }
  }

  wrap.append(textarea, mediaBtn, sendBtn);
  updateButtons();

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
    sendWs({ type: 'typing' });
    hasText = textarea.value.trim().length > 0;
    updateButtons();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
  });

  sendBtn.addEventListener('click', sendText);

  // Media button: tap → toggle mic/cam; hold (>300ms) → start voice recording
  let holdTimer = null;
  let didHold = false;

  function onMediaDown(e) {
    e.preventDefault();
    didHold = false;
    holdTimer = setTimeout(() => {
      if (mediaMode === 'mic') {
        didHold = true;
        startVoiceRecording(wrap, textarea, mediaBtn, onSendMedia);
      }
    }, 280);
  }

  function onMediaUp(e) {
    e.preventDefault();
    clearTimeout(holdTimer);
    if (!didHold) {
      // Short tap: toggle mode
      setMode(mediaMode === 'mic' ? 'cam' : 'mic');
    }
  }

  function onMediaClick(e) {
    // If camera mode: open video recorder on click
    if (mediaMode === 'cam' && !didHold) {
      openVideoRecorder(onSendMedia);
    }
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
    updateButtons();
    await sendMessage(content, convId);
  }

  return wrap;
}

async function sendMessage(content, convId) {
  const tmpId = 'tmp_' + Date.now();
  const now = Math.floor(Date.now() / 1000);
  const optimistic = {
    id: tmpId, conversation_id: convId,
    sender_id: state.user.id, content,
    created_at: now, status: 'pending', _decrypted: true,
  };

  const prev = state.messages[convId] || [];
  state.messages = { ...state.messages, [convId]: [optimistic, ...prev] };

  try {
    const body = await buildMessageBody(content, convId);
    const data = await api.post(`/conversations/${convId}/messages`, body);
    const msgs = state.messages[convId] || [];
    state.messages = {
      ...state.messages,
      [convId]: msgs.map(m => m.id === tmpId
        ? { ...data.message, status: 'sent', _decrypted: true, content } : m),
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

const iconSend = () => `<svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="2" y1="9" x2="16" y2="9"/><polyline points="10 3 16 9 10 15"/></svg>`;
const iconMic = () => `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="1" width="6" height="10" rx="3"/><path d="M3 9a6 6 0 0 0 12 0"/><line x1="9" y1="15" x2="9" y2="17"/><line x1="6" y1="17" x2="12" y2="17"/></svg>`;
const iconCam = () => `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M1 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V6z"/><circle cx="9" cy="9.5" r="2.5"/><path d="M6 4l1.2-2h3.6L12 4"/></svg>`;
