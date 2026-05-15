import { state, on, off } from '../lib/state.js';
import { formatTime, formatDate } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { decryptMessage, importPublicKey } from '../lib/crypto.js';

function applyWatermark(el) {
  const name = state.user?.display_name || state.user?.username || '';
  if (!name) return;
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='220' height='160'><text x='50%' y='50%' font-family='Inter,system-ui,sans-serif' font-size='13' fill='rgba(255,255,255,0.045)' text-anchor='middle' dominant-baseline='middle' transform='rotate(-25 110 80)'>${name.replace(/[<>&'"]/g, '')}</text></svg>`;
  el.style.backgroundImage = `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  el.style.backgroundRepeat = 'repeat';
  el.style.backgroundSize = '220px 160px';
}

export function renderMessageList(convId, isGroup) {
  const container = document.createElement('div');
  container.className = 'message-list';
  applyWatermark(container);

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
        try { theirPublicKey = await importPublicKey(other.public_key); } catch {}
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

      // Расшифровываем если есть nonce и ключ
      let displayContent = msg.content;
      let decrypted = false;
      if (msg.nonce && theirPublicKey && state.myKeyPair && !msg._decrypted) {
        displayContent = await decryptMessage(msg.content, msg.nonce, state.myKeyPair.privateKey, theirPublicKey);
        decrypted = true;
      } else if (msg._decrypted) {
        decrypted = true;
      }

      container.appendChild(renderBubble({ ...msg, content: displayContent }, decrypted || !!msg.nonce, isGroup));
    }

    container.scrollTop = container.scrollHeight;
  }

  function onMessages() { render(); }
  on('messages', onMessages);
  render();

  container._destroy = () => off('messages', onMessages);
  return container;
}

function renderBubble(msg, isEncrypted, isGroup) {
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
  bubble.className = `message-bubble ${isOwn ? 'own' : 'other'}${msg.status === 'pending' ? ' pending' : ''}${msg.status === 'failed' ? ' failed' : ''}`;
  bubble.textContent = msg.content;
  wrap.appendChild(bubble);

  const meta = document.createElement('div');
  meta.className = 'message-time';
  meta.textContent = formatTime(msg.created_at) + (isEncrypted ? ' 🔒' : '');
  wrap.appendChild(meta);

  if (!isOwn && msg.id && !msg.id.startsWith('tmp_')) {
    api.post(`/messages/${msg.id}/read`).catch(() => {});
  }

  return wrap;
}
