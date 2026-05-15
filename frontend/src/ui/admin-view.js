import { api } from '../lib/api.js';
import { state } from '../lib/state.js';
import { storage } from '../lib/storage.js';

export async function renderAdmin() {
  const wrap = document.createElement('div');
  wrap.className = 'admin-wrap';

  if (state.user?.username !== 'admin') {
    wrap.innerHTML = '<div style="color:var(--danger)">Access denied</div>';
    return wrap;
  }

  wrap.innerHTML = `
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
      <div class="admin-title" style="margin:0">Admin</div>
      <button class="btn" id="back-btn">← Back to chat</button>
    </div>
    <form class="admin-create-form" id="create-form">
      <input class="input" name="username" placeholder="Username" required />
      <input class="input" name="password" type="password" placeholder="Password" required />
      <input class="input" name="display_name" placeholder="Display name (optional)" />
      <button class="btn btn-primary" type="submit">Create user</button>
    </form>
    <div id="create-error" style="color:var(--danger);font-size:13px;margin-bottom:16px;min-height:20px"></div>
    <table>
      <thead>
        <tr>
          <th>Username</th>
          <th>Display name</th>
          <th>Created</th>
          <th>Last seen</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody id="users-table"></tbody>
    </table>
  `;

  wrap.querySelector('#back-btn').addEventListener('click', () => { location.hash = '#/chat'; });

  async function loadUsers() {
    try {
      const users = await api.get('/admin/users');
      const tbody = wrap.querySelector('#users-table');
      tbody.innerHTML = '';
      for (const u of users) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${escHtml(u.username)}</td>
          <td>${escHtml(u.display_name || '—')}</td>
          <td>${u.created_at ? new Date(u.created_at * 1000).toLocaleDateString('ru') : '—'}</td>
          <td>${u.last_seen ? new Date(u.last_seen * 1000).toLocaleString('ru') : 'Never'}</td>
          <td class="admin-actions">
            <button class="btn btn-danger" data-reset="${u.id}">Reset pw</button>
            ${u.username !== 'admin' ? `<button class="btn btn-danger" data-delete="${u.id}">Delete</button>` : ''}
          </td>
        `;
        tbody.appendChild(tr);
      }
    } catch (e) {
      console.error('Load users error:', e);
    }
  }

  wrap.querySelector('#users-table').addEventListener('click', async (e) => {
    const resetId = e.target.dataset.reset;
    const deleteId = e.target.dataset.delete;

    if (resetId) {
      const pw = prompt('New password:');
      if (!pw) return;
      try {
        await api.post(`/admin/users/${resetId}/reset-password`, { new_password: pw });
        alert('Password reset');
      } catch (err) { alert(err.message); }
    }

    if (deleteId) {
      if (!confirm('Delete this user?')) return;
      try {
        await api.delete(`/admin/users/${deleteId}`);
        await loadUsers();
      } catch (err) { alert(err.message); }
    }
  });

  wrap.querySelector('#create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errEl = wrap.querySelector('#create-error');
    errEl.textContent = '';
    try {
      await api.post('/admin/users', {
        username: form.username.value.trim(),
        password: form.password.value,
        display_name: form.display_name.value.trim() || undefined,
      });
      form.reset();
      await loadUsers();
    } catch (err) {
      errEl.textContent = err.message;
    }
  });

  await loadUsers();
  return wrap;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
