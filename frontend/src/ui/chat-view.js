import { state, on, off } from '../lib/state.js';
import { api } from '../lib/api.js';
import { connect, disconnect, setMessageHandler } from '../lib/ws.js';
import { renderSidebar } from './sidebar.js';
import { renderMessageList } from './message-list.js';
import { renderComposer } from './composer.js';
import { formatLastSeen, initials } from '../lib/utils.js';

const isMobile = () => window.innerWidth <= 768;

/* Color hash for avatar — same as sidebar */
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 8;
}

export async function renderChat() {
  await loadConversations();

  const layout = document.createElement('div');
  layout.className = 'chat-layout';

  const sidebar = renderSidebar(selectConv);

  /* Main area */
  const mainArea = document.createElement('div');
  mainArea.className = 'chat-main';
  renderEmpty(mainArea);

  layout.append(sidebar, mainArea);

  let currentConvId = null;
  let headerEl = null;
  let msgListEl = null;

  /* ── Mobile slide helpers ── */
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

  /* ── WebSocket message handler ── */
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
      state.messages = {
        ...state.messages,
        [currentConvId]: existing.filter(m => m.id !== msg.data.id),
      };
    } else if (msg.type === 'messages:purged') {
      const convId = msg.data.conversation_id;
      const uid = msg.data.user_id;
      const existing = state.messages[convId] || [];
      state.messages = {
        ...state.messages,
        [convId]: existing.filter(m => m.sender_id !== uid),
      };
      loadConversations();
    } else if (msg.type === 'presence') {
      const { user_id, online } = msg.data;
      const set = new Set(state.onlineUsers);
      if (online) set.add(user_id); else set.delete(user_id);
      state.onlineUsers = set;
      updateHeader();
    }
  });

  /* ── Select conversation ── */
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

    /* Header */
    headerEl = document.createElement('div');
    headerEl.className = 'chat-header';
    renderHeaderContent(headerEl, conv, showSidebar);
    mainArea.appendChild(headerEl);

    /* Message list */
    msgListEl = renderMessageList(convId, conv.type === 'group');
    mainArea.appendChild(msgListEl);

    /* Composer */
    mainArea.appendChild(renderComposer(convId));

    showChat();
    connect(convId);
  }

  /* ── Header render ── */
  function renderHeaderContent(el, conv, onBack) {
    if (!el || !conv) return;
    el.innerHTML = '';

    const other = conv.members?.find(m => m.id !== state.user?.id);
    const isOnline = other && state.onlineUsers.has(other.id);
    const name = conv.type === 'group'
      ? (conv.name || 'Group')
      : (other?.display_name || other?.username || 'Chat');

    /* Back button (shown only on mobile via CSS) */
    const backBtn = document.createElement('button');
    backBtn.className = 'btn-back';
    backBtn.setAttribute('aria-label', 'Back');
    backBtn.innerHTML = iconBack();
    backBtn.addEventListener('click', onBack);
    el.appendChild(backBtn);

    /* Avatar */
    const avatar = document.createElement('div');
    avatar.className = 'avatar-sm';
    avatar.dataset.color = avatarColor(name);
    avatar.textContent = initials(name);
    el.appendChild(avatar);

    /* Info */
    const info = document.createElement('div');
    info.className = 'chat-header-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'chat-header-name';
    nameEl.textContent = name;

    let statusText = '';
    let statusClass = 'chat-header-status';
    if (conv.type === 'direct') {
      statusText = isOnline ? 'online' : formatLastSeen(other?.last_seen);
      if (isOnline) statusClass += ' online';
    } else {
      statusText = `${conv.members?.length ?? 0} members`;
    }

    const statusEl = document.createElement('div');
    statusEl.className = statusClass;
    statusEl.textContent = statusText;

    info.append(nameEl, statusEl);
    el.appendChild(info);
  }

  function updateHeader() {
    if (!headerEl || !currentConvId) return;
    const conv = state.conversations.find(c => c.id === currentConvId);
    if (conv) renderHeaderContent(headerEl, conv, showSidebar);
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

/* ── Empty state ── */
function renderEmpty(container) {
  container.innerHTML = '';
  const empty = document.createElement('div');
  empty.className = 'chat-empty';
  empty.innerHTML = `
    <div class="chat-empty-icon">${iconChat()}</div>
    <div class="chat-empty-text">Select a chat to start messaging</div>
  `;
  container.appendChild(empty);
}

async function loadConversations() {
  try {
    state.conversations = await api.get('/conversations');
  } catch {}
}

/* ── Icons ── */
function iconBack() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="12 4 6 10 12 16"/>
  </svg>`;
}

function iconChat() {
  return `<svg width="40" height="40" viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M36 18c0 8.837-7.163 16-16 16a15.93 15.93 0 0 1-8.485-2.428L4 34l2.428-7.515A15.93 15.93 0 0 1 4 18C4 9.163 11.163 2 20 2s16 7.163 16 16z"/>
  </svg>`;
}
