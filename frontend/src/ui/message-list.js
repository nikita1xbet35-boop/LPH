import { state, on, off } from '../lib/state.js';
import { formatTime, formatDate } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { decryptMessage, importPublicKeyField } from '../lib/crypto.js';

/* Group messages from the same sender within 5 minutes */
const GROUP_THRESHOLD = 5 * 60; // seconds

export function renderMessageList(convId, isGroup) {
  const container = document.createElement('div');
  container.className = 'message-list';

  async function render() {
    const msgs = (state.messages[convId] || []).slice().reverse();
    container.innerHTML = '';

    if (!msgs.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);font-size:13px;margin:auto';
      empty.textContent = 'No messages yet';
      container.appendChild(empty);
      return;
    }

    /* Resolve decryption key once */
    let theirPublicKey = null;
    if (!isGroup && state.myKeyPair) {
      const conv = state.conversations.find(c => c.id === convId);
      const other = conv?.members?.find(m => m.id !== state.user?.id);
      if (other?.public_key) {
        try { theirPublicKey = await importPublicKeyField(other.public_key); } catch {}
      }
    }

    /* Decrypt all messages and determine grouping */
    const processed = [];
    for (const msg of msgs) {
      let displayContent = msg.content;
      let decrypted = false;
      let decryptFailed = false;

      if (msg.nonce && theirPublicKey && state.myKeyPair && !msg._decrypted) {
        const result = await decryptMessage(msg.content, msg.nonce, state.myKeyPair.privateKey, theirPublicKey);
        if (result !== null) {
          displayContent = result;
          decrypted = true;
        } else {
          decryptFailed = true;
        }
      } else if (msg._decrypted) {
        decrypted = true;
      }

      processed.push({ ...msg, content: displayContent, _decrypted: decrypted, _decryptFailed: decryptFailed });
    }

    /* Compute grouping: a message is "grouped" (no tail, no sender name) if it comes right after
       a message from the same sender within GROUP_THRESHOLD seconds */
    let lastDate = null;
    for (let i = 0; i < processed.length; i++) {
      const msg = processed[i];
      const prev = processed[i - 1];
      const next = processed[i + 1];

      /* Date separator */
      const dateLabel = formatDate(msg.created_at);
      if (dateLabel !== lastDate) {
        lastDate = dateLabel;
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        const pill = document.createElement('span');
        pill.className = 'date-separator-pill';
        pill.textContent = dateLabel;
        sep.appendChild(pill);
        container.appendChild(sep);
      }

      /* Grouping logic */
      const isSameSenderAsPrev = prev
        && prev.sender_id === msg.sender_id
        && Math.abs(msg.created_at - prev.created_at) < GROUP_THRESHOLD;

      const isSameSenderAsNext = next
        && next.sender_id === msg.sender_id
        && Math.abs(next.created_at - msg.created_at) < GROUP_THRESHOLD;

      /* "isLast" in a group → show tail; "isFirst" → show sender name */
      const isFirst = !isSameSenderAsPrev; // first of a group (or standalone)
      const isLast  = !isSameSenderAsNext; // last of a group (or standalone)
      const grouped = isSameSenderAsPrev; // not the first → tighter spacing

      container.appendChild(
        renderBubble(msg, msg._decrypted || !!msg.nonce, isGroup, msg._decryptFailed, isFirst, isLast, grouped)
      );
    }

    container.scrollTop = container.scrollHeight;
  }

  function onMessages() { render(); }
  on('messages', onMessages);
  render();

  container._destroy = () => off('messages', onMessages);
  return container;
}

/* ─── Parse media payload ─── */
function parseMedia(content) {
  if (!content || content[0] !== '{') return null;
  try {
    const obj = JSON.parse(content);
    if (obj.t === 'audio' || obj.t === 'video') return obj;
  } catch {}
  return null;
}

function fmtDur(s) {
  const sec = Math.max(0, Math.floor(s));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/* Seeded pseudo-random waveform bars — same seed → same shape every render */
function makeWaveBars(dur, count = 30) {
  let s = (dur || 1) * 1000;
  const bars = [];
  for (let i = 0; i < count; i++) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const h = 4 + ((s >>> 0) % 24); // 4–27px
    bars.push(h);
  }
  return bars;
}

/* ─── Audio bubble ─── */
function renderAudioBubble(media, isOwn, isLast) {
  const wrap = document.createElement('div');
  wrap.className = `media-audio ${isOwn ? 'own' : 'other'}${isLast ? ' tail' : ''}`;

  /* Play/pause button */
  const playBtn = document.createElement('button');
  playBtn.className = 'media-play-btn';
  playBtn.innerHTML = iconPlay();

  /* Waveform */
  const BAR_COUNT = 30;
  const heights = makeWaveBars(media.dur, BAR_COUNT);
  const waveform = document.createElement('div');
  waveform.className = 'waveform';
  const barEls = heights.map(h => {
    const b = document.createElement('div');
    b.className = 'wave-bar';
    b.style.height = h + 'px';
    waveform.appendChild(b);
    return b;
  });

  /* Duration display */
  const dur = document.createElement('span');
  dur.className = 'media-dur';
  dur.textContent = fmtDur(media.dur || 0);

  wrap.append(playBtn, waveform, dur);

  const src = `data:${media.mime || 'audio/webm'};base64,${media.data}`;
  const audio = new Audio(src);
  let playing = false;
  const playedClass = isOwn ? 'played' : 'other-played';

  function updateWave() {
    if (!audio.duration) return;
    const pct = audio.currentTime / audio.duration;
    const filled = Math.round(pct * BAR_COUNT);
    barEls.forEach((b, i) => b.classList.toggle(playedClass, i < filled));
    dur.textContent = fmtDur(audio.duration - audio.currentTime);
  }

  audio.addEventListener('timeupdate', updateWave);
  audio.addEventListener('ended', () => {
    playing = false;
    playBtn.innerHTML = iconPlay();
    barEls.forEach(b => b.classList.remove(playedClass));
    dur.textContent = fmtDur(media.dur || 0);
  });

  waveform.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = waveform.getBoundingClientRect();
    audio.currentTime = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * audio.duration;
    updateWave();
  });

  playBtn.addEventListener('click', () => {
    if (playing) {
      audio.pause();
      playing = false;
      playBtn.innerHTML = iconPlay();
    } else {
      audio.play();
      playing = true;
      playBtn.innerHTML = iconPause();
    }
  });

  return wrap;
}

/* ─── Video circle bubble ─── */
function renderVideoBubble(media) {
  const wrap = document.createElement('div');
  wrap.className = 'media-video-wrap';

  const circle = document.createElement('div');
  circle.className = 'media-video-circle';

  const video = document.createElement('video');
  video.src = `data:${media.mime || 'video/webm'};base64,${media.data}`;
  video.playsInline = true;
  video.setAttribute('webkit-playsinline', '');
  video.loop = true;
  video.preload = 'metadata';

  const overlay = document.createElement('div');
  overlay.className = 'media-video-overlay';
  overlay.innerHTML = iconPlay();

  const durBadge = document.createElement('div');
  durBadge.className = 'media-video-dur';
  durBadge.textContent = fmtDur(media.dur || 0);

  let playing = false;
  circle.addEventListener('click', () => {
    if (playing) {
      video.pause();
      playing = false;
      overlay.style.opacity = '1';
      durBadge.style.display = '';
    } else {
      video.play();
      playing = true;
      overlay.style.opacity = '0';
      durBadge.style.display = 'none';
    }
  });

  circle.append(video, overlay, durBadge);
  wrap.append(circle);
  return wrap;
}

/* ─── Text bubble + footer ─── */
function renderBubble(msg, isEncrypted, isGroup, decryptFailed, isFirst, isLast, grouped) {
  const isOwn = msg.sender_id === state.user?.id;

  const wrap = document.createElement('div');
  wrap.className = `message-wrap ${isOwn ? 'own' : 'other'}${grouped ? ' grouped' : ''}`;

  /* Sender name — only for first in group in group chats */
  if (isGroup && !isOwn && isFirst) {
    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = msg._senderName || msg.sender_id;
    wrap.appendChild(sender);
  }

  const media = !decryptFailed ? parseMedia(msg.content) : null;

  if (media) {
    /* Media bubble */
    const mediaBubble = media.t === 'video'
      ? renderVideoBubble(media)
      : renderAudioBubble(media, isOwn, isLast);
    wrap.appendChild(mediaBubble);

    /* Meta row below media */
    const meta = document.createElement('div');
    meta.className = 'message-meta';
    meta.textContent = formatTime(msg.created_at);
    if (isEncrypted && !decryptFailed) {
      const lock = document.createElement('span');
      lock.className = 'message-lock';
      lock.textContent = '🔒';
      meta.appendChild(lock);
    }
    if (media.t !== 'video') wrap.appendChild(meta);
  } else {
    /* Text bubble */
    const bubble = document.createElement('div');
    let classes = `message-bubble ${isOwn ? 'own' : 'other'}`;
    if (isLast) classes += ' tail';
    if (msg.status === 'pending') classes += ' pending';
    if (msg.status === 'failed') classes += ' failed';
    if (decryptFailed) classes += ' decrypt-failed';
    bubble.className = classes;

    if (decryptFailed) {
      bubble.textContent = '🔒 Encrypted message';
    } else {
      bubble.textContent = msg.content;
    }

    /* Message footer: time + lock + status */
    const footer = document.createElement('div');
    footer.className = 'message-footer';

    const timeEl = document.createElement('span');
    timeEl.className = 'message-time';
    timeEl.textContent = formatTime(msg.created_at);
    footer.appendChild(timeEl);

    if (isEncrypted && !decryptFailed) {
      const lock = document.createElement('span');
      lock.className = 'message-lock';
      lock.textContent = '🔒';
      footer.appendChild(lock);
    }

    if (isOwn) {
      const status = document.createElement('span');
      status.className = 'message-status' + (msg.status === 'read' ? ' read' : '');
      status.textContent = msg.status === 'read' ? '✓✓' : '✓';
      footer.appendChild(status);
    }

    bubble.appendChild(footer);
    wrap.appendChild(bubble);

    if (msg.status === 'failed') {
      const retry = document.createElement('div');
      retry.className = 'message-retry';
      retry.textContent = 'Failed — tap to retry';
      wrap.appendChild(retry);
    }
  }

  /* Mark as read */
  if (!isOwn && msg.id && !String(msg.id).startsWith('tmp_')) {
    api.post(`/messages/${msg.id}/read`).catch(() => {});
  }

  return wrap;
}

/* ─── Icons ─── */
function iconPlay() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><polygon points="4,2 13,8 4,14"/></svg>`;
}
function iconPause() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12" rx="1"/><rect x="9" y="2" width="4" height="12" rx="1"/></svg>`;
}
