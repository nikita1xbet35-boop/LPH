const PREFIX = 'node_';

export const storage = {
  get(key) {
    try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch {}
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch {}
  },
  clear() {
    Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k));
  },
};
