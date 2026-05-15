import { state, on, off } from '../lib/state.js';
import { formatTime, formatDate } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { decryptMessage, importPublicKey } from '../lib/crypto.js';

export function renderMessageList(convId, isGroup) {
  const container = document.createElement('div');
  container.className = 'message-list';

  async function render() {
    const msgs = (state.messages[convId] || []).slice().reverse();
    container.innerHTML = '';
    if (!msgs.length) {
      container.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-2);font-size:13px">No messages yet</div>';
      return;
    }

    // Получаем публичный ключ собеседника для расшифровки
    const conv = state.conversations.find(c => c.id === convId);
    const other = conv?.members?.find(m => m.id !== state.user?.id);
    let theirPublicKey = null;
    if (!isGroup && other?.public_key && state.myKeyPair) {
      try { theirPublicKey = await importPublicKey(other.public_key); } catch {}
    }

    // Расшифровываем сообщения
    const decrypted = await Promise.all(msgs.map(msg => decryptMsg(msg, theirPublicKey)));

    let lastDate = null;
    for (const msg of decrypted) {
      const dateLabel = formatDate(msg.created_at);
      if (dateLabel !== lastDate) {
        lastDate = dateLabel;
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        sep.textContent = dateLabel;
        container.appendChild(sep);
      }
      container.appendChild(renderMessage(msg, isGroup));
    }
    container.scrollTop = container.scrollHeight;
  }

  function onMessages() { render(); }
  on('messages', onMessages);
  render();

  container._destroy = () => off('messages', onMessages);
  return container;
}

async function decryptMsg(msg, theirPublicKey) {
  if (msg._decrypted) return msg;
  if (!msg.nonce || !theirPublicKey || !state.myKeyPair) return msg;

  // Определяем чей ключ использовать: если я отправитель — расшифровываем своим ключом от их публичного
  // Если они отправитель — расшифровываем своим от их публичного (симметрично)
  const content = await decryptMessage(msg.content, msg.nonce, state.myKeyPair.privateKey, theirPublicKey);
  return { ...msg, content, _decrypted: true };
}

function renderMessage(msg, isGroup) {
  const isOwn = msg.sender_id === state.user?.id;
  const wrap = document.createElement('div');
  wrap.className = 'message-wrap ' + (isOwn ? 'own' : 'other');
  wrap.dataset.id = msg.id;

  if (isGroup && !isOwn) {
    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = msg._senderName || msg.sender_id;
    wrap.appendChild(sender);
  }

  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${isOwn ? 'own' : 'other'}${msg.status === 'pending' ? ' pending' : ''}${msg.status === 'failed' ? ' failed' : ''}`;

  // Если зашифровано но не расшифровалось — показываем замок
  if (msg.nonce && !msg._decrypted) {
    bubble.innerHTML = `<span style="color:var(--text-2)">🔒 encrypted</span>`;
  } else {
    bubble.textContent = msg.content;
  }

  wrap.appendChild(bubble);

  // Иконка замка для E2E сообщений
  const meta = document.createElement('div');
  meta.className = 'message-time';
  meta.textContent = formatTime(msg.created_at) + (msg.nonce ? ' 🔒' : '');
  wrap.appendChild(meta);

  if (!isOwn && msg.id && !msg.id.startsWith('tmp_')) {
    api.post(`/messages/${msg.id}/read`).catch(() => {});
  }

  return wrap;
}
