import { api } from '../lib/api.js';
import { state } from '../lib/state.js';
import { sendWs } from '../lib/ws.js';
import { encryptMessage, importPublicKey } from '../lib/crypto.js';

export function renderComposer(convId) {
  const wrap = document.createElement('div');
  wrap.className = 'composer';

  const textarea = document.createElement('textarea');
  textarea.className = 'composer-textarea';
  textarea.placeholder = 'Message...';
  textarea.rows = 1;

  const sendBtn = document.createElement('button');
  sendBtn.className = 'btn-icon';
  sendBtn.title = 'Send';
  sendBtn.innerHTML = iconSend();

  wrap.append(textarea, sendBtn);

  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 200) + 'px';
    sendWs({ type: 'typing' });
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  sendBtn.addEventListener('click', send);

  async function send() {
    const content = textarea.value.trim();
    if (!content) return;
    textarea.value = '';
    textarea.style.height = 'auto';

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
        [convId]: msgs.map(m => m.id === tmpId ? { ...data.message, status: 'sent', _decrypted: true, content } : m),
      };
    } catch {
      const msgs = state.messages[convId] || [];
      state.messages = {
        ...state.messages,
        [convId]: msgs.map(m => m.id === tmpId ? { ...m, status: 'failed' } : m),
      };
    }
  }

  return wrap;
}

async function buildMessageBody(content, convId) {
  const myKeyPair = state.myKeyPair;
  if (!myKeyPair) return { content };

  const conv = state.conversations.find(c => c.id === convId);
  if (!conv || conv.type !== 'direct') return { content };

  const other = conv.members?.find(m => m.id !== state.user.id);
  if (!other?.public_key) return { content };

  try {
    const theirPublicKey = await importPublicKey(other.public_key);
    const encrypted = await encryptMessage(content, myKeyPair.privateKey, theirPublicKey);
    return { content: encrypted.content, nonce: encrypted.nonce };
  } catch {
    return { content };
  }
}

function iconSend() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="2" y1="9" x2="16" y2="9"/>
    <polyline points="10 3 16 9 10 15"/>
  </svg>`;
}
