import { api } from '../lib/api.js';
import { storage } from '../lib/storage.js';
import { state } from '../lib/state.js';
import { deriveKEK } from '../lib/crypto.js';

export function renderLogin() {
  const wrap = document.createElement('div');
  wrap.className = 'login-wrap';

  wrap.innerHTML = `
    <div class="login-card">
      <div class="login-logo">
        <div class="login-logo-icon">
          ${iconLogo()}
        </div>
        <div class="login-logo-title">Messenger</div>
        <div class="login-logo-sub">Sign in to continue</div>
      </div>
      <form class="login-form" id="login-form" novalidate>
        <input
          class="login-input"
          type="text"
          name="username"
          placeholder="Username"
          autocomplete="username"
          autocorrect="off"
          autocapitalize="none"
          spellcheck="false"
          required
        />
        <input
          class="login-input"
          type="password"
          name="password"
          placeholder="Password"
          autocomplete="current-password"
          required
        />
        <div class="login-error" id="login-error" role="alert" aria-live="polite"></div>
        <button class="login-submit-btn" type="submit">Sign in</button>
      </form>
      <div class="login-footer">End-to-end encrypted &nbsp;·&nbsp; v0.1</div>
    </div>
  `;

  const form = wrap.querySelector('#login-form');
  const errorEl = wrap.querySelector('#login-error');
  const submitBtn = form.querySelector('.login-submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorEl.textContent = '';
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    try {
      const password = form.password.value;
      const data = await api.post('/auth/login', {
        username: form.username.value.trim(),
        password,
      });
      storage.set('token', data.token);
      state.user = data.user;
      /* Derive KEK from password — used to encrypt/decrypt private key on server */
      state.keyEncryptionKey = await deriveKEK(password, data.user.id);
      location.hash = '#/chat';
    } catch (err) {
      errorEl.textContent = err.message || 'Sign in failed';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign in';
    }
  });

  return wrap;
}

function iconLogo() {
  return `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="white" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M32 16C32 24.837 25.837 31 17 31a14.94 14.94 0 0 1-7.97-2.28L3 31l2.28-7.03A14.94 14.94 0 0 1 3 16C3 7.163 9.163 1 18 1s14 6.163 14 15z"/>
  </svg>`;
}
