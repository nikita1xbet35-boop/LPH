import { state } from './lib/state.js';
import { storage } from './lib/storage.js';
import { api } from './lib/api.js';
import { loadOrCreateKeyPair } from './lib/crypto.js';
import { renderLogin } from './ui/login-view.js';
import { renderChat } from './ui/chat-view.js';
import { renderAdmin } from './ui/admin-view.js';
import { initScreenGuard } from './lib/screen-guard.js';

// Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

initScreenGuard();

const app = document.getElementById('app');
let currentView = null;

async function initKeys(user) {
  if (state.myKeyPair) return;
  const kek = state.keyEncryptionKey;
  const keyPair = await loadOrCreateKeyPair(
    user.id,
    user,
    kek,
    (patch) => api.patch('/users/me', patch).catch(() => {})
  );
  state.myKeyPair = keyPair;
}

async function route() {
  const hash = location.hash || '#/login';

  // Восстанавливаем сессию если есть токен
  if (!state.user && storage.get('token')) {
    try {
      const data = await api.get('/auth/me');
      state.user = data.user;
    } catch {
      storage.remove('token');
    }
  }

  // Инициализируем ключи если залогинены
  if (state.user) await initKeys(state.user);

  // Редиректы
  if (!state.user && hash !== '#/login') {
    location.hash = '#/login';
    return;
  }
  if (state.user && hash === '#/login') {
    location.hash = '#/chat';
    return;
  }

  // Уничтожаем предыдущий view
  if (currentView?._destroy) currentView._destroy();
  app.innerHTML = '';

  if (hash === '#/login') {
    currentView = renderLogin();
    app.appendChild(currentView);
  } else if (hash === '#/admin') {
    currentView = await renderAdmin();
    app.appendChild(currentView);
  } else {
    currentView = await renderChat();
    app.appendChild(currentView);
  }
}

window.addEventListener('hashchange', route);
route();
