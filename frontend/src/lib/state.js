const listeners = {};

function notify(key) {
  (listeners[key] || []).forEach(cb => cb(state[key]));
}

export const state = new Proxy(
  { user: null, conversations: [], activeConvId: null, messages: {}, onlineUsers: new Set(), myKeyPair: null, publicKeys: {} },
  {
    set(obj, key, val) {
      obj[key] = val;
      notify(key);
      return true;
    },
  }
);

export function on(key, cb) {
  if (!listeners[key]) listeners[key] = [];
  listeners[key].push(cb);
}

export function off(key, cb) {
  if (!listeners[key]) return;
  listeners[key] = listeners[key].filter(fn => fn !== cb);
}
