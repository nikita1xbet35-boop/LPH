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

  const empty = document.createElement('div');
  empty.className = 'chat-empty';
  empty.textContent = 'Select a chat';
  mainArea.appendChild(empty);

  layout.append(sidebar, mainArea);

  let currentConvId = null;
  let msgListEl = null;
  let composerEl = null;
  let headerEl = null;

  // Обработчик WS сообщений
  setMessageHandler((msg) => {
    if (msg.type === 'message:new') {
      const m = msg.data.message;
      const convId = m.conversation_id;
      const existing = state.messages[convId] || [];
      // Не дублируем
      if (!existing.find(e => e.id === m.id)) {
        state.messages = { ...state.messages, [convId]: [m, ...existing] };
      }
      // Обновляем превью в сайдбаре
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
    currentConvId = convId;
    state.activeConvId = convId;

    // Перезагружаем conversations чтобы получить актуальные public_key членов
    await loadConversations();

    // Загружаем сообщения
    try {
      const msgs = await api.get(`/conversations/${convId}/messages`);
      state.messages = { ...state.messages, [convId]: msgs };
    } catch {}

    // Рендерим main area
    mainArea.innerHTML = '';

    headerEl = renderHeader(conv);
    mainArea.appendChild(headerEl);

    const isGroup = conv?.type === 'group';
    msgListEl = renderMessageList(convId, isGroup);
    mainArea.appendChild(msgListEl);

    composerEl = renderComposer(convId);
    mainArea.appendChild(composerEl);

    connect(convId);
  }

  function renderHeader(conv) {
    const header = document.createElement('div');
    header.className = 'chat-header';
    header.dataset.convId = conv?.id;
    updateHeader(header, conv);
    return header;
  }

  function updateHeader(el, conv) {
    const h = el || headerEl;
    const c = conv || state.conversations.find(c => c.id === currentConvId);
    if (!h || !c) return;

    const name = getConvName(c);
    const other = c.members?.find(m => m.id !== state.user?.id);
    const isOnline = other && state.onlineUsers.has(other.id);
    const status = c.type === 'direct' ? (isOnline ? 'online' : formatLastSeen(other?.last_seen)) : `${c.members?.length ?? 0} members`;

    h.innerHTML = `
      <div class="chat-header-name">${escHtml(name)}</div>
      <div class="chat-header-status">${status}</div>
    `;
  }

  // Синхронизируем header при изменении onlineUsers
  on('onlineUsers', () => updateHeader());

  layout._destroy = () => {
    disconnect();
    sidebar._destroy?.();
    if (msgListEl) msgListEl._destroy?.();
    off('onlineUsers', () => updateHeader());
  };

  return layout;
}

async function loadConversations() {
  try {
    const data = await api.get('/conversations');
    state.conversations = data;
  } catch {}
}

function getConvName(conv) {
  if (conv.type === 'group') return conv.name ?? 'Group';
  const other = conv.members?.find(m => m.id !== state.user?.id);
  return other?.display_name || other?.username || 'Chat';
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
