import { state, on, off } from '../lib/state.js';
import { api } from '../lib/api.js';
import { connect, disconnect, setMessageHandler } from '../lib/ws.js';
import { renderSidebar } from './sidebar.js';
import { renderMessageList } from './message-list.js';
import { renderComposer } from './composer.js';
import { formatLastSeen } from '../lib/utils.js';

export async function renderChat() {
  await loadConversations();

  const layout = document.createElement('div');
  layout.className = 'chat-layout';

  const sidebar = renderSidebar(selectConv);

  const mainArea = document.createElement('div');
  mainArea.className = 'chat-main';
  mainArea.innerHTML = '<div class="chat-empty">Select a chat</div>';

  layout.append(sidebar, mainArea);

  let currentConvId = null;
  let headerEl = null;
  let msgListEl = null;

  setMessageHandler((msg) => {
    if (msg.type === 'message:new') {
      const m = msg.data.message;
      const existing = state.messages[m.conversation_id] || [];
      if (!existing.find(e => e.id === m.id)) {
        state.messages = { ...state.messages, [m.conversation_id]: [m, ...existing] };
      }
      loadConversations();
    } else if (msg.type === 'message:deleted') {
      if (!currentConvId) return;
      const existing = state.messages[currentConvId] || [];
      state.messages = { ...state.messages, [currentConvId]: existing.filter(m => m.id !== msg.data.id) };
    } else if (msg.type === 'presence') {
      const { user_id, online } = msg.data;
      const set = new Set(state.onlineUsers);
      if (online) set.add(user_id); else set.delete(user_id);
      state.onlineUsers = set;
      updateHeader();
    }
  });

  async function selectConv(convId) {
    if (currentConvId === convId) return;
    disconnect();
    if (msgListEl?._destroy) msgListEl._destroy();
    currentConvId = convId;
    state.activeConvId = convId;

    // Перезагружаем чтобы получить актуальные public_key членов
    await loadConversations();
    const conv = state.conversations.find(c => c.id === convId);
    if (!conv) return;

    // Загружаем сообщения
    try {
      const msgs = await api.get(`/conversations/${convId}/messages`);
      state.messages = { ...state.messages, [convId]: msgs };
    } catch {}

    mainArea.innerHTML = '';

    headerEl = document.createElement('div');
    headerEl.className = 'chat-header';
    renderHeaderContent(headerEl, conv);
    mainArea.appendChild(headerEl);

    msgListEl = renderMessageList(convId, conv.type === 'group');
    mainArea.appendChild(msgListEl);

    mainArea.appendChild(renderComposer(convId));

    connect(convId);
  }

  function renderHeaderContent(el, conv) {
    if (!el || !conv) return;
    const other = conv.members?.find(m => m.id !== state.user?.id);
    const isOnline = other && state.onlineUsers.has(other.id);
    const name = conv.type === 'group'
      ? (conv.name || 'Group')
      : (other?.display_name || other?.username || 'Chat');
    const status = conv.type === 'direct'
      ? (isOnline ? 'online' : formatLastSeen(other?.last_seen))
      : `${conv.members?.length ?? 0} members`;
    el.innerHTML = `
      <div class="chat-header-name">${escHtml(name)}</div>
      <div class="chat-header-status">${status}</div>
    `;
  }

  function updateHeader() {
    if (!headerEl || !currentConvId) return;
    const conv = state.conversations.find(c => c.id === currentConvId);
    renderHeaderContent(headerEl, conv);
  }

  on('onlineUsers', updateHeader);

  layout._destroy = () => {
    disconnect();
    sidebar._destroy?.();
    msgListEl?._destroy?.();
    off('onlineUsers', updateHeader);
  };

  return layout;
}

async function loadConversations() {
  try {
    state.conversations = await api.get('/conversations');
  } catch {}
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
