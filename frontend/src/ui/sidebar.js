import { state, on, off } from '../lib/state.js';
import { api } from '../lib/api.js';
import { storage } from '../lib/storage.js';
import { initials, formatTime } from '../lib/utils.js';
import { renderNewChatModal } from './new-chat-modal.js';

export function renderSidebar(onSelect) {
  const sidebar = document.createElement('div');
  sidebar.className = 'sidebar';

  const header = document.createElement('div');
  header.className = 'sidebar-header';
  const newBtn = document.createElement('button');
  newBtn.className = 'btn';
  newBtn.style.width = '100%';
  newBtn.innerHTML = `${iconPlus()} New chat`;
  header.appendChild(newBtn);

  const list = document.createElement('div');
  list.className = 'conv-list';

  const footer = document.createElement('div');
  footer.className = 'sidebar-footer';
  const userLabel = document.createElement('div');
  userLabel.className = 'sidebar-user';
  userLabel.textContent = state.user?.username ?? '';
  const logoutBtn = document.createElement('button');
  logoutBtn.className = 'btn-icon';
  logoutBtn.title = 'Sign out';
  logoutBtn.innerHTML = iconLogout();
  footer.append(userLabel, logoutBtn);

  sidebar.append(header, list, footer);

  function renderList() {
    list.innerHTML = '';
    const convs = state.conversations;
    if (!convs.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:16px;color:var(--text-2);font-size:13px;text-align:center;';
      empty.textContent = 'No chats yet';
      list.appendChild(empty);
      return;
    }
    for (const conv of convs) {
      const item = document.createElement('div');
      item.className = 'conv-item' + (conv.id === state.activeConvId ? ' active' : '');
      item.dataset.id = conv.id;

      const name = getConvName(conv);
      const preview = conv.last_message?.content ?? '';
      const time = conv.last_message ? formatTime(conv.last_message.created_at) : '';

      item.innerHTML = `
        <div class="conv-avatar">${initials(name)}</div>
        <div class="conv-info">
          <div class="conv-name">${escHtml(name)}</div>
          <div class="conv-preview">${escHtml(preview)}</div>
        </div>
        <div class="conv-meta">
          <div class="conv-time">${time}</div>
          ${conv.unread_count > 0 ? `<div class="conv-unread">${conv.unread_count}</div>` : ''}
        </div>
      `;
      item.addEventListener('click', () => onSelect(conv.id));
      list.appendChild(item);
    }
  }

  function onConvs() { renderList(); }
  function onActive() { renderList(); }
  on('conversations', onConvs);
  on('activeConvId', onActive);
  renderList();

  newBtn.addEventListener('click', () => {
    const modal = renderNewChatModal(async (conv) => {
      await loadConversations();
      onSelect(conv.id);
    });
    document.body.appendChild(modal);
  });

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

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function iconPlus() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
    <line x1="8" y1="2" x2="8" y2="14"/><line x1="2" y1="8" x2="14" y2="8"/>
  </svg>`;
}

function iconLogout() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>
    <polyline points="11 11 14 8 11 5"/>
    <line x1="14" y1="8" x2="6" y2="8"/>
  </svg>`;
}
