function getSupportedVideoType() {
  const types = ['video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
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

const MAX_SEC = 15;

export function openVideoRecorder(onSendMedia) {
  if (!navigator.mediaDevices?.getUserMedia) return;
  openRecorder(onSendMedia);
}

async function openRecorder(onSendMedia) {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 320 } },
      audio: true,
    });
  } catch {
    alert('Camera access denied');
    return;
  }

  /* ── Build overlay ── */
  const overlay = document.createElement('div');
  overlay.className = 'video-rec-overlay';

  const wrapEl = document.createElement('div');
  wrapEl.className = 'video-rec-wrap';

  /* Preview circle */
  const circleEl = document.createElement('div');
  circleEl.className = 'video-rec-circle';

  const previewEl = document.createElement('video');
  previewEl.className = 'video-rec-preview';
  previewEl.autoplay = true;
  previewEl.playsInline = true;
  previewEl.muted = true;

  const ringAnim = document.createElement('div');
  ringAnim.className = 'video-rec-ring-anim';
  ringAnim.style.display = 'none';

  circleEl.append(previewEl, ringAnim);

  /* Controls row */
  const controlsEl = document.createElement('div');
  controlsEl.className = 'video-rec-controls';

  const timerEl = document.createElement('div');
  timerEl.className = 'video-rec-timer';
  timerEl.textContent = '0:00';
  timerEl.style.opacity = '0';

  const cancelEl = document.createElement('button');
  cancelEl.className = 'video-rec-cancel';
  cancelEl.setAttribute('aria-label', 'Close');
  cancelEl.innerHTML = iconX();

  const recBtnEl = document.createElement('button');
  recBtnEl.className = 'video-rec-btn';
  recBtnEl.setAttribute('aria-label', 'Record');

  controlsEl.append(timerEl, cancelEl, recBtnEl);

  wrapEl.append(circleEl, controlsEl);
  overlay.appendChild(wrapEl);
  document.body.appendChild(overlay);

  /* Attach camera stream */
  previewEl.srcObject = stream;

  /* ── Recorder state ── */
  let recorder = null;
  let chunks = [];
  let timerInterval = null;
  let startTime = 0;
  let isRecording = false;
  let blobResult = null;
  let durResult = 0;

  function stopStream() { stream.getTracks().forEach(t => t.stop()); }

  function close() {
    if (recorder?.state === 'recording') recorder.stop();
    stopStream();
    clearInterval(timerInterval);
    overlay.remove();
  }

  /* ── Start recording ── */
  async function startRec() {
    const mimeType = getSupportedVideoType();
    const opts = { videoBitsPerSecond: 400_000 };
    if (mimeType) opts.mimeType = mimeType;

    recorder = new MediaRecorder(stream, opts);
    chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(200);

    isRecording = true;
    startTime = Date.now();
    recBtnEl.classList.add('recording');
    ringAnim.style.display = '';
    timerEl.style.opacity = '1';

    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= MAX_SEC) stopRec();
    }, 300);
  }

  /* ── Stop recording ── */
  async function stopRec() {
    if (!isRecording) return;
    isRecording = false;
    clearInterval(timerInterval);
    recBtnEl.classList.remove('recording');
    ringAnim.style.display = 'none';
    recorder.stop();
    await new Promise(r => { recorder.onstop = r; });

    durResult = Math.min((Date.now() - startTime) / 1000, MAX_SEC);
    if (durResult < 0.5) { timerEl.style.opacity = '0'; return; }

    const rawMime = chunks[0]?.type || getSupportedVideoType() || 'video/webm';
    const mime = rawMime.split(';')[0];
    blobResult = new Blob(chunks, { type: rawMime });

    /* Preview recorded clip */
    const previewUrl = URL.createObjectURL(blobResult);
    previewEl.srcObject = null;
    previewEl.src = previewUrl;
    previewEl.muted = false;
    previewEl.loop = true;
    previewEl.play();

    recBtnEl.style.display = 'none';
    timerEl.style.opacity = '0';

    /* Confirm row */
    const confirmRow = document.createElement('div');
    confirmRow.className = 'video-rec-confirm';

    const discardBtn = document.createElement('button');
    discardBtn.className = 'video-rec-action cancel';
    discardBtn.textContent = 'Cancel';

    const sendBtn = document.createElement('button');
    sendBtn.className = 'video-rec-action send';
    sendBtn.textContent = 'Send';

    confirmRow.append(discardBtn, sendBtn);
    controlsEl.appendChild(confirmRow);

    discardBtn.addEventListener('click', () => {
      URL.revokeObjectURL(previewUrl);
      close();
    });

    sendBtn.addEventListener('click', async () => {
      URL.revokeObjectURL(previewUrl);
      close();
      if (blobResult.size > 4 * 1024 * 1024) {
        alert('Video too large. Try a shorter clip.');
        return;
      }
      try {
        const data = await blobToBase64(blobResult);
        onSendMedia({ t: 'video', data, mime, dur: Math.round(durResult) });
      } catch (e) {
        alert('Failed to encode video: ' + e.message);
      }
    });
  }

  recBtnEl.addEventListener('click', () => { isRecording ? stopRec() : startRec(); });
  cancelEl.addEventListener('click', close);
}

function iconX() {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <line x1="5" y1="5" x2="15" y2="15"/>
    <line x1="15" y1="5" x2="5" y2="15"/>
  </svg>`;
}
