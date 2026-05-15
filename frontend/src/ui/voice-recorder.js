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

// Called by composer on hold. Shows recording UI inline, sends on release.
export async function startVoiceRecording(composerEl, textarea, mediaBtn, onSendMedia) {
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

  // Recording bar replaces textarea + media button
  const recBar = document.createElement('div');
  recBar.className = 'rec-bar';
  recBar.innerHTML = `
    <button class="rec-cancel" title="Cancel">${iconX()}</button>
    <div class="rec-pulse"></div>
    <span class="rec-timer">0:00</span>
    <span class="rec-hint">Release to send</span>
  `;
  textarea.style.display = 'none';
  mediaBtn.style.display = 'none';
  composerEl.insertBefore(recBar, composerEl.firstChild);

  const timerEl = recBar.querySelector('.rec-timer');
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
  }

  recBar.querySelector('.rec-cancel').addEventListener('click', () => {
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

    if (dur < 0.5) return;

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

  // Listen for mouseup/touchend on the whole document to detect release
  function onRelease(e) {
    document.removeEventListener('mouseup', onRelease);
    document.removeEventListener('touchend', onRelease);
    finish();
  }
  document.addEventListener('mouseup', onRelease);
  document.addEventListener('touchend', onRelease);
}

function iconX() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
  </svg>`;
}
