import { state, on, off } from '../lib/state.js';
import { api } from '../lib/api.js';
import { connect, disconnect, setMessageHandler } from '../lib/ws.js';
import { renderSidebar } from './sidebar.js';
import { renderMessageList } from './message-list.js';
import { renderComposer } from './composer.js';
import { formatLastSeen } from '../lib/utils.js';

const isMobile = () => window.innerWidth <= 768;

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

  function showChat() {
    if (!isMobile()) return;
    sidebar.classList.add('hidden');
    mainArea.classList.add('visible');
  }

  function showSidebar() {
    if (!isMobile()) return;
    sidebar.classList.remove('hidden');
    mainArea.classList.remove('visible');
  }

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
    } else if (msg.type === 'messages:purged') {
      const convId = msg.data.conversation_id;
      const uid = msg.data.user_id;
      const existing = state.messages[convId] || [];
      state.messages = { ...state.messages, [convId]: existing.filter(m => m.sender_id !== uid) };
      loadConversations();
    } else if (msg.type === 'presence') {
      const { user_id, online } = msg.data;
      const set = new Set(state.onlineUsers);
      if (online) set.add(user_id); else set.delete(user_id);
      state.onlineUsers = set;
      updateHeader();
    }
  });

  async function selectConv(convId) {
    if (currentConvId === convId) { showChat(); return; }
    disconnect();
    if (msgListEl?._destroy) msgListEl._destroy();
    currentConvId = convId;
    state.activeConvId = convId;

    await loadConversations();
    const conv = state.conversations.find(c => c.id === convId);
    if (!conv) return;

    try {
      const msgs = await api.get(`/conversations/${convId}/messages`);
      state.messages = { ...state.messages, [convId]: msgs };
    } catch {}

    mainArea.innerHTML = '';

    // Header с кнопкой Back на мобиле
    headerEl = document.createElement('div');
    headerEl.className = 'chat-header';
    renderHeaderContent(headerEl, conv, showSidebar);
    mainArea.appendChild(headerEl);

    msgListEl = renderMessageList(convId, conv.type === 'group');
    mainArea.appendChild(msgListEl);
    mainArea.appendChild(renderComposer(convId));

    showChat();
    connect(convId);
  }

  function renderHeaderContent(el, conv, onBack) {
    if (!el || !conv) return;
    const other = conv.members?.find(m => m.id !== state.user?.id);
    const isOnline = other && state.onlineUsers.has(other.id);
    const name = conv.type === 'group'
      ? (conv.name || 'Group')
      : (other?.display_name || other?.username || 'Chat');
    const status = conv.type === 'direct'
      ? (isOnline ? 'online' : formatLastSeen(other?.last_seen))
      : `${conv.members?.length ?? 0} members`;

    el.innerHTML = '';

    // Back button — только на мобиле (скрыт через CSS на десктопе)
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-back btn-icon';
    backBtn.style.cssText = 'display:none';
    backBtn.innerHTML = iconBack();
    backBtn.addEventListener('click', onBack);
    el.appendChild(backBtn);

    // Показываем кнопку только на мобиле
    if (isMobile()) backBtn.style.display = 'flex';

    const info = document.createElement('div');
    info.className = 'chat-header-info';
    info.innerHTML = `
      <div class="chat-header-name">${escHtml(name)}</div>
      <div class="chat-header-status">${status}</div>
    `;
    el.appendChild(info);
  }

  function updateHeader() {
    if (!headerEl || !currentConvId) return;
    const conv = state.conversations.find(c => c.id === currentConvId);
    renderHeaderContent(headerEl, conv, showSidebar);
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

function iconBack() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="11 4 5 9 11 14"/>
  </svg>`;
}
