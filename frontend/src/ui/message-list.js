import { state, on, off } from '../lib/state.js';
import { formatTime, formatDate } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { decryptMessage, importPublicKeyField } from '../lib/crypto.js';

export function renderMessageList(convId, isGroup) {
  const container = document.createElement('div');
  container.className = 'message-list';

  async function render() {
    const msgs = (state.messages[convId] || []).slice().reverse();
    container.innerHTML = '';

    if (!msgs.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-2);font-size:13px';
      empty.textContent = 'No messages yet';
      container.appendChild(empty);
      return;
    }

    // Для direct-чатов получаем ключ собеседника
    let theirPublicKey = null;
    if (!isGroup && state.myKeyPair) {
      const conv = state.conversations.find(c => c.id === convId);
      const other = conv?.members?.find(m => m.id !== state.user?.id);
      if (other?.public_key) {
        try { theirPublicKey = await importPublicKeyField(other.public_key); } catch {}
      }
    }

    let lastDate = null;
    for (const msg of msgs) {
      const dateLabel = formatDate(msg.created_at);
      if (dateLabel !== lastDate) {
        lastDate = dateLabel;
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        sep.textContent = dateLabel;
        container.appendChild(sep);
      }

      let displayContent = msg.content;
      let decrypted = false;
      let decryptFailed = false;

      if (msg.nonce && theirPublicKey && state.myKeyPair && !msg._decrypted) {
        const result = await decryptMessage(msg.content, msg.nonce, state.myKeyPair.privateKey, theirPublicKey);
        if (result !== null) {
          displayContent = result;
          decrypted = true;
        } else {
          decryptFailed = true;
        }
      } else if (msg._decrypted) {
        decrypted = true;
      }

      container.appendChild(renderBubble({ ...msg, content: displayContent }, decrypted || !!msg.nonce, isGroup, decryptFailed));
    }

    container.scrollTop = container.scrollHeight;
  }

  function onMessages() { render(); }
  on('messages', onMessages);
  render();

  container._destroy = () => off('messages', onMessages);
  return container;
}

function renderBubble(msg, isEncrypted, isGroup, decryptFailed) {
  const isOwn = msg.sender_id === state.user?.id;
  const wrap = document.createElement('div');
  wrap.className = 'message-wrap ' + (isOwn ? 'own' : 'other');

  if (isGroup && !isOwn) {
    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = msg._senderName || msg.sender_id;
    wrap.appendChild(sender);
  }

  const bubble = document.createElement('div');
  bubble.className = `message-bubble ${isOwn ? 'own' : 'other'}${msg.status === 'pending' ? ' pending' : ''}${msg.status === 'failed' ? ' failed' : ''}${decryptFailed ? ' decrypt-failed' : ''}`;

  if (decryptFailed) {
    bubble.innerHTML = `<span style="opacity:0.5">🔒</span>`;
  } else {
    bubble.textContent = msg.content;
  }

  wrap.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'message-time';
  meta.textContent = formatTime(msg.created_at) + (isEncrypted && !decryptFailed ? ' 🔒' : '');
  wrap.appendChild(meta);

  if (!isOwn && msg.id && !msg.id.startsWith('tmp_')) {
    api.post(`/messages/${msg.id}/read`).catch(() => {});
  }

  return wrap;
}
