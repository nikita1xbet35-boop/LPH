import { state, on, off } from '../lib/state.js';
import { formatTime, formatDate } from '../lib/utils.js';
import { api } from '../lib/api.js';

export function renderMessageList(convId, isGroup) {
  const container = document.createElement('div');
  container.className = 'message-list';

  function render() {
    const msgs = (state.messages[convId] || []).slice().reverse();
    container.innerHTML = '';
    if (!msgs.length) {
      container.innerHTML = '<div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-2);font-size:13px">No messages yet</div>';
      return;
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
  bubble.textContent = msg.content;
  wrap.appendChild(bubble);

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = formatTime(msg.created_at);
  wrap.appendChild(time);

  if (msg.status === 'failed') {
    const retry = document.createElement('div');
    retry.className = 'message-retry';
    retry.textContent = 'Failed. Tap to retry';
    retry.addEventListener('click', () => retryMessage(msg));
    wrap.appendChild(retry);
  }

  // Пометить как прочитанное
  if (!isOwn && msg.id && !msg.id.startsWith('tmp_')) {
    api.post(`/messages/${msg.id}/read`).catch(() => {});
  }

  return wrap;
}

async function retryMessage(failedMsg) {
  const convId = failedMsg.conversation_id;
  const msgs = state.messages[convId] || [];
  // Убираем failed сообщение
  state.messages = {
    ...state.messages,
    [convId]: msgs.filter(m => m.id !== failedMsg.id),
  };
  // Повторная отправка через composer — пока просто удаляем
}
