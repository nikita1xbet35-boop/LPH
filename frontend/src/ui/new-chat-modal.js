import { api } from '../lib/api.js';
import { initials } from '../lib/utils.js';

export function renderNewChatModal(onCreated) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">New chat</div>
      <div class="modal-type-toggle">
        <button class="btn btn-primary" data-type="direct">Direct</button>
        <button class="btn" data-type="group">Group</button>
      </div>
      <input class="input" id="modal-group-name" placeholder="Group name" style="display:none;margin-bottom:8px" />
      <div class="user-select-list" id="user-list">Loading...</div>
      <div class="modal-actions">
        <button class="btn" id="modal-cancel">Cancel</button>
        <button class="btn btn-primary" id="modal-create">Create</button>
      </div>
    </div>
  `;

  let chatType = 'direct';
  const selected = new Set();
  let users = [];

  const typeButtons = overlay.querySelectorAll('[data-type]');
  const groupNameInput = overlay.querySelector('#modal-group-name');
  const userList = overlay.querySelector('#user-list');
  const createBtn = overlay.querySelector('#modal-create');

  function setType(type) {
    chatType = type;
    typeButtons.forEach(btn => {
      btn.className = btn.dataset.type === type ? 'btn btn-primary' : 'btn';
    });
    groupNameInput.style.display = type === 'group' ? 'block' : 'none';
    if (type === 'direct') {
      // В direct — только один выбор
      if (selected.size > 1) {
        const first = [...selected][0];
        selected.clear();
        selected.add(first);
        renderUsers();
      }
    }
  }

  typeButtons.forEach(btn => btn.addEventListener('click', () => setType(btn.dataset.type)));

  async function loadUsers() {
    try {
      users = await api.get('/users');
      renderUsers();
    } catch {
      userList.textContent = 'Failed to load users';
    }
  }

  function renderUsers() {
    userList.innerHTML = '';
    for (const user of users) {
      const item = document.createElement('div');
      item.className = 'user-select-item' + (selected.has(user.id) ? ' selected' : '');
      item.innerHTML = `
        <div class="conv-avatar" style="width:32px;height:32px;min-width:32px">${initials(user.display_name || user.username)}</div>
        <div>
          <div style="font-size:13px;font-weight:500">${escHtml(user.display_name || user.username)}</div>
          <div style="font-size:11px;color:var(--text-2)">@${escHtml(user.username)}</div>
        </div>
      `;
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
      userList.appendChild(item);
    }
  }

  createBtn.addEventListener('click', async () => {
    if (!selected.size) return;
    createBtn.disabled = true;
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
    }
  });

  overlay.querySelector('#modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  loadUsers();
  return overlay;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
