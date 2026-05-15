export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (sameDay(d, today)) return 'Today';
  if (sameDay(d, yesterday)) return 'Yesterday';
  return d.toLocaleDateString('ru', { day: 'numeric', month: 'short' });
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function initials(name) {
  if (!name) return '?';
  return name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

export function formatLastSeen(ts) {
  if (!ts) return 'offline';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60) return 'online';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return formatDate(ts);
}

export function el(tag, attrs = {}, children = []) {
  const element = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') element.className = v;
    else if (k.startsWith('on')) element.addEventListener(k.slice(2), v);
    else element.setAttribute(k, v);
  }
  for (const child of children) {
    if (typeof child === 'string') element.appendChild(document.createTextNode(child));
    else if (child) element.appendChild(child);
  }
  return element;
}
