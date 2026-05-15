import { state, on, off } from '../lib/state.js';
import { api } from '../lib/api.js';
import { storage } from '../lib/storage.js';
import { initials, formatTime } from '../lib/utils.js';
import { renderNewChatModal } from './new-chat-modal.js';

/* Color hash for avatar — deterministic from name string */
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 8;
}

export function renderSidebar(onSelect) {
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';

  /* ── Header ── */
  const header = document.createElement('div');
  header.className = 'sidebar-header';

  const title = document.createElement('div');
  title.className = 'sidebar-title';
  title.textContent = 'Messenger';

  const newBtn = document.createElement('button');
  newBtn.className = 'sidebar-new-btn';
  newBtn.title = 'New chat';
  newBtn.innerHTML = iconPencil();

  header.append(title, newBtn);

  /* ── Search ── */
  const searchWrap = document.createElement('div');
  searchWrap.className = 'sidebar-search';

  const searchInner = document.createElement('div');
  searchInner.className = 'sidebar-search-wrap';

  const searchIcon = document.createElement('span');
  searchIcon.className = 'sidebar-search-icon';
  searchIcon.innerHTML = iconSearch();

  const searchInput = document.createElement('input');
  searchInput.className = 'sidebar-search-input';
  searchInput.type = 'search';
  searchInput.placeholder = 'Search';
  searchInput.autocomplete = 'off';
  searchInput.spellcheck = false;

  searchInner.append(searchIcon, searchInput);
  searchWrap.appendChild(searchInner);

  /* ── Conversation list ── */
  const list = document.createElement('div');
  list.className = 'conv-list';

  /* ── Footer ── */
  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';

  const userLabel = document.createElement('div');
  userLabel.className = 'sidebar-user';
  userLabel.textContent = state.user?.username ?? '';

  const purgeBtn = document.createElement('button');
  purgeBtn.className = 'sidebar-icon-btn danger';
  purgeBtn.title = 'Delete all my messages';
  purgeBtn.innerHTML = iconTrash();

  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'sidebar-icon-btn';
  logoutBtn.title = 'Sign out';
  logoutBtn.innerHTML = iconLogout();

  footer.append(userLabel, purgeBtn, logoutBtn);

  sidebar.append(header, searchWrap, list, footer);

  /* ── Render logic ── */
  let filterQuery = '';

  function renderList() {
    list.innerHTML = '';
    let convs = state.conversations;

    if (filterQuery) {
      const q = filterQuery.toLowerCase();
      convs = convs.filter(c => getConvName(c).toLowerCase().includes(q));
    }

    if (!convs.length) {
      const empty = document.createElement('div');
      empty.className = 'conv-list-empty';
      empty.textContent = filterQuery ? 'No results' : 'No chats yet';
      list.appendChild(empty);
      return;
    }

    for (const conv of convs) {
      const item = buildConvItem(conv, onSelect);
      list.appendChild(item);
    }
  }

  function buildConvItem(conv, onSelect) {
    const item = document.createElement('div');
    const isActive = conv.id === state.activeConvId;
    item.className = 'conv-item' + (isActive ? ' active' : '');
    item.dataset.id = conv.id;

    const name = getConvName(conv);
    const colorIdx = avatarColor(name);

    /* Avatar */
    const avatar = document.createElement('div');
    avatar.className = 'conv-avatar';
    avatar.dataset.color = colorIdx;
    avatar.textContent = initials(name);

    /* Info column */
    const info = document.createElement('div');
    info.className = 'conv-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'conv-name';
    nameEl.textContent = name;

    const previewEl = document.createElement('div');
    previewEl.className = 'conv-preview';
    previewEl.textContent = buildPreview(conv);

    info.append(nameEl, previewEl);

    /* Meta column */
    const meta = document.createElement('div');
    meta.className = 'conv-meta';

    const timeEl = document.createElement('div');
    timeEl.className = 'conv-time';
    timeEl.textContent = conv.last_message ? formatTime(conv.last_message.created_at) : '';

    meta.appendChild(timeEl);

    if (conv.unread_count > 0) {
      const badge = document.createElement('div');
      badge.className = 'conv-unread';
      badge.textContent = conv.unread_count > 99 ? '99+' : conv.unread_count;
      meta.appendChild(badge);
    }

    item.append(avatar, info, meta);
    item.addEventListener('click', () => onSelect(conv.id));
    return item;
  }

  function buildPreview(conv) {
    if (!conv.last_message) return '';
    const content = conv.last_message.content ?? '';
    if (content.startsWith('{"t":"audio"')) return '🎤 Voice message';
    if (content.startsWith('{"t":"video"')) return '📹 Video message';
    if (conv.type === 'group') {
      const senderId = conv.last_message.sender_id;
      const member = conv.members?.find(m => m.id === senderId);
      const senderName = member?.display_name || member?.username || '';
      return senderName ? `${senderName}: ${content}` : content;
    }
    return content;
  }

  /* ── Event subscriptions ── */
  function onConvs() { renderList(); }
  function onActive() { renderList(); }
  on('conversations', onConvs);
  on('activeConvId', onActive);
  renderList();

  /* ── Search ── */
  searchInput.addEventListener('input', () => {
    filterQuery = searchInput.value.trim();
    renderList();
  });

  /* ── New chat ── */
  newBtn.addEventListener('click', () => {
    const modal = renderNewChatModal(async (conv) => {
      await loadConversations();
      onSelect(conv.id);
    });
    document.body.appendChild(modal);
  });

  /* ── Purge ── */
  purgeBtn.addEventListener('click', async () => {
    const ok = confirm('Delete all your messages for everyone? This cannot be undone.');
    if (!ok) return;
    purgeBtn.disabled = true;
    try {
      await api.delete('/users/me/messages');
      state.messages = {};
      state.conversations = [];
      await loadConversations();
    } catch (e) {
      alert('Failed: ' + e.message);
    } finally {
      purgeBtn.disabled = false;
    }
  });

  /* ── Logout ── */
  logoutBtn.addEventListener('click', async () => {
    try { await api.post('/auth/logout'); } catch {}
    storage.clear();
    state.user = null;
    location.hash = '#/login';
  });

  sidebar._destroy = () => {
    off('conversations', onConvs);
    off('activeConvId', onActive);
  };

  return sidebar;
}

async function loadConversations() {
  const data = await api.get('/conversations');
  state.conversations = data;
}

function getConvName(conv) {
  if (conv.type === 'group') return conv.name ?? 'Group';
  const other = conv.members?.find(m => m.id !== state.user?.id);
  return other?.display_name || other?.username || 'Chat';
}

/* ── Icons ── */
function iconPencil() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M14.5 2.5a2.121 2.121 0 0 1 3 3L6 17l-4 1 1-4L14.5 2.5z"/>
  </svg>`;
}

function iconSearch() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="7" cy="7" r="5"/>
    <line x1="11" y1="11" x2="14" y2="14"/>
  </svg>`;
}

function iconLogout() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 3H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>
    <polyline points="12 12 15 9 12 6"/>
    <line x1="15" y1="9" x2="7" y2="9"/>
  </svg>`;
}

function iconTrash() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="3 5 15 5"/>
    <path d="M6 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/>
    <path d="M7 8v6M11 8v6"/>
    <path d="M4 5l1 10a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-10"/>
  </svg>`;
}
