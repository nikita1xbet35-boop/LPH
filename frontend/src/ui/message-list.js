import { state, on, off } from '../lib/state.js';
import { formatTime, formatDate } from '../lib/utils.js';
import { api } from '../lib/api.js';
import { decryptMessage, importPublicKeyField } from '../lib/crypto.js';

export function renderMessageList(convId, isGroup) {
  const container = document.createElement('div');
  container.className = 'message-list';

  async function render() {
    const msgs = (state.messages[convId] || []).slice().reverse();
    container.innerHTML = '';

    if (!msgs.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-2);font-size:13px';
      empty.textContent = 'No messages yet';
      container.appendChild(empty);
      return;
    }

    let theirPublicKey = null;
    if (!isGroup && state.myKeyPair) {
      const conv = state.conversations.find(c => c.id === convId);
      const other = conv?.members?.find(m => m.id !== state.user?.id);
      if (other?.public_key) {
        try { theirPublicKey = await importPublicKeyField(other.public_key); } catch {}
      }
    }

    let lastDate = null;
    for (const msg of msgs) {
      const dateLabel = formatDate(msg.created_at);
      if (dateLabel !== lastDate) {
        lastDate = dateLabel;
        const sep = document.createElement('div');
        sep.className = 'date-separator';
        sep.textContent = dateLabel;
        container.appendChild(sep);
      }

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

      container.appendChild(renderBubble({ ...msg, content: displayContent }, decrypted || !!msg.nonce, isGroup, decryptFailed));
    }

    container.scrollTop = container.scrollHeight;
  }

  function onMessages() { render(); }
  on('messages', onMessages);
  render();

  container._destroy = () => off('messages', onMessages);
  return container;
}

function parseMedia(content) {
  if (!content || content[0] !== '{') return null;
  try {
    const obj = JSON.parse(content);
    if (obj.t === 'audio' || obj.t === 'video') return obj;
  } catch {}
  return null;
}

function fmtDur(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Seeded pseudo-random waveform — same seed (duration) → same bars every render
function makeWaveBars(dur, count = 30) {
  let s = (dur || 1) * 1000;
  const bars = [];
  for (let i = 0; i < count; i++) {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    const h = 3 + ((s >>> 0) % 26); // 3–28px
    bars.push(h);
  }
  return bars;
}

function renderAudioBubble(media, isOwn) {
  const wrap = document.createElement('div');
  wrap.className = `media-audio ${isOwn ? 'own' : 'other'}`;

  const playBtn = document.createElement('button');
  playBtn.className = 'media-play-btn';
  playBtn.innerHTML = iconPlay();

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
    dur.textContent = fmtDur(Math.floor(audio.duration - audio.currentTime));
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

  let playing = false;
  circle.addEventListener('click', () => {
    if (playing) {
      video.pause();
      playing = false;
      overlay.style.opacity = '1';
    } else {
      video.play();
      playing = true;
      overlay.style.opacity = '0';
    }
  });

  const dur = document.createElement('div');
  dur.className = 'media-video-dur';
  dur.textContent = fmtDur(media.dur || 0);

  circle.append(video, overlay);
  wrap.append(circle, dur);
  return wrap;
}

function renderBubble(msg, isEncrypted, isGroup, decryptFailed) {
  const isOwn = msg.sender_id === state.user?.id;
  const wrap = document.createElement('div');
  wrap.className = 'message-wrap ' + (isOwn ? 'own' : 'other');

  if (isGroup && !isOwn) {
    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = msg._senderName || msg.sender_id;
    wrap.appendChild(sender);
  }

  const media = !decryptFailed ? parseMedia(msg.content) : null;

  if (media) {
    // Media bubble — no text bubble wrapper
    const mediaBubble = media.t === 'video'
      ? renderVideoBubble(media)
      : renderAudioBubble(media, isOwn);
    wrap.appendChild(mediaBubble);

    const meta = document.createElement('div');
    meta.className = 'message-time';
    meta.textContent = formatTime(msg.created_at);
    if (media.t !== 'video') wrap.appendChild(meta);
  } else {
    const bubble = document.createElement('div');
    bubble.className = `message-bubble ${isOwn ? 'own' : 'other'}${msg.status === 'pending' ? ' pending' : ''}${msg.status === 'failed' ? ' failed' : ''}${decryptFailed ? ' decrypt-failed' : ''}`;

    if (decryptFailed) {
      bubble.innerHTML = `<span style="opacity:0.5">🔒</span>`;
    } else {
      bubble.textContent = msg.content;
    }

    wrap.appendChild(bubble);

    const meta = document.createElement('div');
    meta.className = 'message-time';
    meta.textContent = formatTime(msg.created_at) + (isEncrypted && !decryptFailed ? ' 🔒' : '');
    wrap.appendChild(meta);
  }

  if (!isOwn && msg.id && !msg.id.startsWith('tmp_')) {
    api.post(`/messages/${msg.id}/read`).catch(() => {});
  }

  return wrap;
}

function iconPlay() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><polygon points="3,2 13,8 3,14"/></svg>`;
}
function iconPause() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12"/><rect x="9" y="2" width="4" height="12"/></svg>`;
}
