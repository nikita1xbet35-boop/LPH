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

export function attachVideoRecorder(composerEl, onSendMedia) {
  if (!navigator.mediaDevices?.getUserMedia) return;

  const camBtn = document.createElement('button');
  camBtn.className = 'btn-icon composer-cam';
  camBtn.title = 'Video circle';
  camBtn.innerHTML = iconCamera();

  const sendBtn = composerEl.querySelector('.btn-icon:last-child');
  composerEl.insertBefore(camBtn, sendBtn);

  camBtn.addEventListener('click', () => openRecorder(onSendMedia));
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

  const overlay = document.createElement('div');
  overlay.className = 'video-rec-overlay';
  overlay.innerHTML = `
    <div class="video-rec-wrap">
      <video class="video-rec-preview" autoplay playsinline muted></video>
      <div class="video-rec-ring"></div>
      <div class="video-rec-controls">
        <button class="btn-icon video-rec-cancel">${iconX()}</button>
        <button class="video-rec-btn" id="recBtn"></button>
        <div class="video-rec-timer" style="opacity:0">0:00</div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const previewEl = overlay.querySelector('.video-rec-preview');
  const recBtn = overlay.querySelector('#recBtn');
  const timerEl = overlay.querySelector('.video-rec-timer');
  previewEl.srcObject = stream;

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

  async function startRec() {
    const mimeType = getSupportedVideoType();
    const opts = { videoBitsPerSecond: 400000 };
    if (mimeType) opts.mimeType = mimeType;
    recorder = new MediaRecorder(stream, opts);
    chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(200);
    isRecording = true;
    startTime = Date.now();
    recBtn.classList.add('recording');
    timerEl.style.opacity = '1';

    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      timerEl.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= MAX_SEC) stopRec();
    }, 300);
  }

  async function stopRec() {
    if (!isRecording) return;
    isRecording = false;
    clearInterval(timerInterval);
    recorder.stop();
    await new Promise(r => { recorder.onstop = r; });
    durResult = Math.min((Date.now() - startTime) / 1000, MAX_SEC);
    if (durResult < 0.5) { recBtn.classList.remove('recording'); timerEl.style.opacity = '0'; return; }

    const mimeType = chunks[0]?.type || getSupportedVideoType() || 'video/webm';
    blobResult = new Blob(chunks, { type: mimeType });

    // Show recorded preview
    const previewUrl = URL.createObjectURL(blobResult);
    previewEl.srcObject = null;
    previewEl.src = previewUrl;
    previewEl.muted = false;
    previewEl.loop = true;
    previewEl.play();
    recBtn.style.display = 'none';
    timerEl.style.opacity = '0';

    const confirmRow = document.createElement('div');
    confirmRow.className = 'video-rec-confirm';
    confirmRow.innerHTML = `
      <button class="btn btn-danger">Cancel</button>
      <button class="btn btn-primary">Send</button>
    `;
    overlay.querySelector('.video-rec-controls').appendChild(confirmRow);

    confirmRow.querySelector('.btn-danger').onclick = () => { URL.revokeObjectURL(previewUrl); close(); };
    confirmRow.querySelector('.btn-primary').onclick = async () => {
      URL.revokeObjectURL(previewUrl);
      close();
      if (blobResult.size > 2 * 1024 * 1024) {
        alert('Video too large (max 15s). Try a shorter clip.');
        return;
      }
      try {
        const data = await blobToBase64(blobResult);
        onSendMedia({ t: 'video', data, mime: blobResult.type, dur: Math.round(durResult) });
      } catch (e) {
        alert('Failed to encode video: ' + e.message);
      }
    };
  }

  recBtn.addEventListener('click', () => { isRecording ? stopRec() : startRec(); });
  overlay.querySelector('.video-rec-cancel').addEventListener('click', close);
}

function iconCamera() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <path d="M1 5h16v11H1z" rx="2"/><circle cx="9" cy="10.5" r="3"/><path d="M6 5l1.5-3h3L12 5"/>
  </svg>`;
}
function iconX() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
  </svg>`;
}
