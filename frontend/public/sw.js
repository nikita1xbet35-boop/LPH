const CACHE = 'node-v1';
const PRECACHE = ['/', '/src/styles/reset.css', '/src/styles/tokens.css', '/src/styles/app.css'];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE).catch(() => {})));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/') || e.request.url.includes('/ws')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

self.addEventListener('push', (e) => {
  const data = e.data?.json() ?? {};

  e.waitUntil((async () => {
    // Don't show notification if user has the app open and visible
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (allClients.some(c => c.visibilityState === 'visible')) return;

    await self.registration.showNotification(data.title || 'New message', {
      body: data.body || '',
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'chat-msg',
      renotify: true,
      vibrate: [100, 50, 100],
      data: { url: data.url || '/#/chat' },
    });
  })());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = e.notification.data?.url || '/#/chat';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) {
        existing.focus();
        existing.navigate(url);
      } else {
        self.clients.openWindow(url);
      }
    })
  );
});

