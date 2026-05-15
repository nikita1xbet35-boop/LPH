import { api } from './api.js';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

export async function initPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;

  try {
    // Get VAPID public key from backend
    const { key } = await api.get('/push/vapid-public-key');
    if (!key) return; // Not configured

    const reg = await navigator.serviceWorker.ready;

    // Check existing subscription
    let sub = await reg.pushManager.getSubscription();

    if (!sub) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;

      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
    }

    // Register with backend
    await api.post('/push/subscribe', { subscription: sub.toJSON() });
  } catch (e) {
    // Push not available or denied — silently ignore
    console.debug('Push init:', e?.message ?? e);
  }
}
