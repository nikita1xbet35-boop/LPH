function getSupportedAudioType() {
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Called by composer on hold.
 * Replaces the composer contents with a recording bar.
 * Sends on pointer release, cancels on X button.
 *
 * @param {HTMLElement} composerEl  - the .composer wrapper
 * @param {HTMLElement} textarea    - textarea to hide
 * @param {HTMLElement} mediaBtn    - mic/cam button to hide
 * @param {HTMLElement} sendBtn     - send button to hide
 * @param {HTMLElement} attachBtn   - attach button to hide
 * @param {Function}    onSendMedia - callback({ t, data, mime, dur })
 */
export async function startVoiceRecording(composerEl, textarea, mediaBtn, sendBtn, attachBtn, onSendMedia) {
  if (!navigator.mediaDevices?.getUserMedia) return;

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert('Microphone access denied');
    return;
  }

  const mimeType = getSupportedAudioType();
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  const chunks = [];
  recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
  recorder.start(100);
  const startTime = Date.now();

  /* ── Build recording bar ── */
  const recBar = document.createElement('div');
  recBar.className = 'rec-bar';

  /* Cancel button */
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'rec-cancel-btn';
  cancelBtn.title = 'Cancel';
  cancelBtn.innerHTML = iconX();

  /* Pulsing indicator */
  const pulse = document.createElement('div');
  pulse.className = 'rec-pulse';

  /* Timer */
  const timerEl = document.createElement('span');
  timerEl.className = 'rec-timer';
  timerEl.textContent = '0:00';

  /* Slide hint */
  const hint = document.createElement('span');
  hint.className = 'rec-slide-hint';
  hint.innerHTML = `${iconArrowLeft()} Slide to cancel`;

  recBar.append(cancelBtn, pulse, timerEl, hint);

  /* Hide existing composer elements */
  textarea.style.display = 'none';
  mediaBtn.style.display = 'none';
  sendBtn.style.display = 'none';
  attachBtn.style.display = 'none';

  /* Insert recording bar */
  composerEl.insertBefore(recBar, composerEl.firstChild);

  let cancelled = false;

  const timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - startTime) / 1000);
    timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
    if (s >= 120) finish(); // 2 min max
  }, 500);

  function stopStream() { stream.getTracks().forEach(t => t.stop()); }

  function cleanup() {
    clearInterval(timerInterval);
    recBar.remove();
    textarea.style.display = '';
    mediaBtn.style.display = '';
    sendBtn.style.display = '';
    attachBtn.style.display = '';
  }

  cancelBtn.addEventListener('click', () => {
    cancelled = true;
    recorder.stop();
    stopStream();
    cleanup();
  });

  async function finish() {
    if (cancelled) return;
    const dur = (Date.now() - startTime) / 1000;
    recorder.stop();
    await new Promise(r => { recorder.onstop = r; });
    stopStream();
    cleanup();

    if (dur < 0.5) return; // too short — discard

    const mime = chunks[0]?.type || mimeType || 'audio/webm';
    const blob = new Blob(chunks, { type: mime });
    if (blob.size > 3 * 1024 * 1024) { alert('Recording too long (max ~2 min)'); return; }

    try {
      const data = await blobToBase64(blob);
      onSendMedia({ t: 'audio', data, mime: mime.split(';')[0], dur: Math.round(dur) });
    } catch (e) {
      alert('Failed to encode audio: ' + e.message);
    }
  }

  /* Release (mouseup / touchend) anywhere → send */
  function onRelease() {
    document.removeEventListener('mouseup', onRelease);
    document.removeEventListener('touchend', onRelease);
    finish();
  }
  document.addEventListener('mouseup', onRelease);
  document.addEventListener('touchend', onRelease);
}

function iconX() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <line x1="3" y1="3" x2="13" y2="13"/>
    <line x1="13" y1="3" x2="3" y2="13"/>
  </svg>`;
}

function iconArrowLeft() {
  return `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <line x1="12" y1="7" x2="2" y2="7"/>
    <polyline points="6 3 2 7 6 11"/>
  </svg>`;
}
