import { api } from '../lib/api.js';
import { initials } from '../lib/utils.js';

/* Color hash for avatar — deterministic from name string */
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash % 8;
}

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function renderNewChatModal(onCreated) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  /* ── Modal shell ── */
  const modal = document.createElement('div');
  modal.className = 'modal';

  /* Title */
  const titleEl = document.createElement('div');
  titleEl.className = 'modal-title';
  titleEl.textContent = 'New chat';

  /* Type toggle */
  const typeToggle = document.createElement('div');
  typeToggle.className = 'modal-type-toggle';

  const directBtn = document.createElement('button');
  directBtn.className = 'modal-type-btn active';
  directBtn.dataset.type = 'direct';
  directBtn.textContent = 'Direct';

  const groupBtn = document.createElement('button');
  groupBtn.className = 'modal-type-btn';
  groupBtn.dataset.type = 'group';
  groupBtn.textContent = 'Group';

  typeToggle.append(directBtn, groupBtn);

  /* Group name input (hidden for direct) */
  const groupNameInput = document.createElement('input');
  groupNameInput.className = 'modal-group-name';
  groupNameInput.placeholder = 'Group name';
  groupNameInput.style.display = 'none';

  /* User list */
  const userListEl = document.createElement('div');
  userListEl.className = 'user-select-list';
  userListEl.innerHTML = `<div style="padding:12px;color:var(--text-secondary);font-size:13px">Loading…</div>`;

  /* Actions */
  const actions = document.createElement('div');
  actions.className = 'modal-actions';

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'modal-btn cancel';
  cancelBtn.textContent = 'Cancel';

  const createBtn = document.createElement('button');
  createBtn.className = 'modal-btn confirm';
  createBtn.textContent = 'Create';

  actions.append(cancelBtn, createBtn);

  modal.append(titleEl, typeToggle, groupNameInput, userListEl, actions);
  overlay.appendChild(modal);

  /* ── State ── */
  let chatType = 'direct';
  const selected = new Set();
  let users = [];

  /* ── Type toggle logic ── */
  function setType(type) {
    chatType = type;
    directBtn.className = 'modal-type-btn' + (type === 'direct' ? ' active' : '');
    groupBtn.className = 'modal-type-btn' + (type === 'group' ? ' active' : '');
    groupNameInput.style.display = type === 'group' ? 'block' : 'none';

    if (type === 'direct' && selected.size > 1) {
      const first = [...selected][0];
      selected.clear();
      selected.add(first);
      renderUsers();
    }
  }

  directBtn.addEventListener('click', () => setType('direct'));
  groupBtn.addEventListener('click', () => setType('group'));

  /* ── Load & render users ── */
  async function loadUsers() {
    try {
      users = await api.get('/users');
      renderUsers();
    } catch {
      userListEl.innerHTML = `<div style="padding:12px;color:var(--text-secondary);font-size:13px">Failed to load users</div>`;
    }
  }

  function renderUsers() {
    userListEl.innerHTML = '';
    if (!users.length) {
      userListEl.innerHTML = `<div style="padding:12px;color:var(--text-secondary);font-size:13px">No users found</div>`;
      return;
    }
    for (const user of users) {
      const name = user.display_name || user.username;
      const isSelected = selected.has(user.id);
      const colorIdx = avatarColor(name);

      const item = document.createElement('div');
      item.className = 'user-select-item' + (isSelected ? ' selected' : '');

      /* Avatar */
      const avatar = document.createElement('div');
      avatar.className = 'avatar-md';
      avatar.dataset.color = colorIdx;
      avatar.textContent = initials(name);

      /* Name + username */
      const info = document.createElement('div');
      info.style.flex = '1';
      info.style.minWidth = '0';

      const nameEl = document.createElement('div');
      nameEl.className = 'user-select-item-name';
      nameEl.textContent = name;

      const subEl = document.createElement('div');
      subEl.className = 'user-select-item-sub';
      subEl.textContent = '@' + user.username;

      info.append(nameEl, subEl);

      /* Checkmark */
      const check = document.createElement('div');
      check.className = 'user-select-item-check';
      if (isSelected) check.innerHTML = iconCheck();

      item.append(avatar, info, check);

      item.addEventListener('click', () => {
        if (chatType === 'direct') {
          selected.clear();
          selected.add(user.id);
        } else {
          if (selected.has(user.id)) selected.delete(user.id);
          else selected.add(user.id);
        }
        renderUsers();
      });

      userListEl.appendChild(item);
    }
  }

  /* ── Create ── */
  createBtn.addEventListener('click', async () => {
    if (!selected.size) return;
    createBtn.disabled = true;
    createBtn.textContent = 'Creating…';
    try {
      const body = {
        type: chatType,
        member_ids: [...selected],
        ...(chatType === 'group' ? { name: groupNameInput.value.trim() || 'Group' } : {}),
      };
      const data = await api.post('/conversations', body);
      overlay.remove();
      onCreated(data.conversation);
    } catch (e) {
      alert(e.message);
      createBtn.disabled = false;
      createBtn.textContent = 'Create';
    }
  });

  /* ── Cancel / close ── */
  cancelBtn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  loadUsers();
  return overlay;
}

function iconCheck() {
  return `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polyline points="2 6 5 9 10 3"/>
  </svg>`;
}
