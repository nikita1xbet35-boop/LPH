import { state } from './lib/state.js';
import { storage } from './lib/storage.js';
import { api } from './lib/api.js';
import { renderLogin } from './ui/login-view.js';
import { renderChat } from './ui/chat-view.js';
import { renderAdmin } from './ui/admin-view.js';

const app = document.getElementById('app');
let currentView = null;

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
    // #/chat или #/chat/:id
    currentView = await renderChat();
    app.appendChild(currentView);
  }
}

window.addEventListener('hashchange', route);
route();
