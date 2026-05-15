import { api } from '../lib/api.js';
import { storage } from '../lib/storage.js';
import { state } from '../lib/state.js';

export function renderLogin() {
  const wrap = document.createElement('div');
  wrap.className = 'login-wrap';

  wrap.innerHTML = `
    <div class="login-card">
      <div class="login-logo">///</div>
      <form class="login-form" id="login-form">
        <input class="input" type="text" name="username" placeholder="Username" autocomplete="username" required />
        <input class="input" type="password" name="password" placeholder="Password" autocomplete="current-password" required />
        <button class="btn btn-primary" type="submit">Sign in</button>
        <div class="login-error" id="login-error"></div>
      </form>
      <div class="login-footer">v0.1</div>
    </div>
  `;

  wrap.querySelector('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const errorEl = wrap.querySelector('#login-error');
    errorEl.textContent = '';
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = '...';

    try {
      const data = await api.post('/auth/login', {
        username: form.username.value.trim(),
        password: form.password.value,
      });
      storage.set('token', data.token);
      state.user = data.user;
      location.hash = '#/chat';
    } catch (err) {
      errorEl.textContent = err.message;
      btn.disabled = false;
      btn.textContent = 'Sign in';
    }
  });

  return wrap;
}
