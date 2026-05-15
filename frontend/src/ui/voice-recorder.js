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

export function attachVoiceRecorder(composerEl, onSendMedia) {
  if (!navigator.mediaDevices?.getUserMedia) return;

  const micBtn = document.createElement('button');
  micBtn.className = 'btn-icon composer-mic';
  micBtn.title = 'Voice message';
  micBtn.innerHTML = iconMic();

  const sendBtn = composerEl.querySelector('.btn-icon:last-child');
  composerEl.insertBefore(micBtn, sendBtn);

  let recorder = null;
  let chunks = [];
  let timerInterval = null;
  let startTime = 0;
  let stream = null;

  const recBar = document.createElement('div');
  recBar.className = 'rec-bar';
  recBar.style.display = 'none';
  recBar.innerHTML = `
    <button class="btn-icon rec-cancel" title="Cancel">${iconX()}</button>
    <div class="rec-pulse"></div>
    <span class="rec-timer">0:00</span>
    <button class="btn btn-primary rec-send">Send</button>
  `;
  composerEl.appendChild(recBar);

  const textarea = composerEl.querySelector('textarea');

  function showRecording() {
    textarea.style.display = 'none';
    micBtn.style.display = 'none';
    recBar.style.display = 'flex';
  }
  function hideRecording() {
    textarea.style.display = '';
    micBtn.style.display = '';
    recBar.style.display = 'none';
    clearInterval(timerInterval);
    recBar.querySelector('.rec-timer').textContent = '0:00';
  }

  async function startRecording() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      alert('Microphone access denied');
      return;
    }
    const mimeType = getSupportedAudioType();
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
    chunks = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.start(100);
    startTime = Date.now();
    showRecording();

    timerInterval = setInterval(() => {
      const s = Math.floor((Date.now() - startTime) / 1000);
      recBar.querySelector('.rec-timer').textContent =
        `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 120) sendRecording(); // 2 min max
    }, 500);
  }

  function stopStream() {
    stream?.getTracks().forEach(t => t.stop());
    stream = null;
  }

  function cancelRecording() {
    recorder?.stop();
    recorder = null;
    stopStream();
    hideRecording();
  }

  async function sendRecording() {
    if (!recorder) return;
    const rec = recorder;
    recorder = null;
    rec.stop();
    await new Promise(r => { rec.onstop = r; });
    stopStream();

    const dur = (Date.now() - startTime) / 1000;
    hideRecording();
    if (dur < 0.5) return;

    const mimeType = chunks[0]?.type || getSupportedAudioType() || 'audio/webm';
    const blob = new Blob(chunks, { type: mimeType });

    if (blob.size > 3 * 1024 * 1024) {
      alert('Recording too long (max ~2 min)');
      return;
    }

    try {
      const data = await blobToBase64(blob);
      onSendMedia({ t: 'audio', data, mime: mimeType, dur: Math.round(dur) });
    } catch (e) {
      alert('Failed to encode audio: ' + e.message);
    }
  }

  micBtn.addEventListener('click', startRecording);
  recBar.querySelector('.rec-cancel').addEventListener('click', cancelRecording);
  recBar.querySelector('.rec-send').addEventListener('click', sendRecording);
}

function iconMic() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <rect x="6" y="1" width="6" height="10" rx="3"/>
    <path d="M3 9a6 6 0 0 0 12 0"/><line x1="9" y1="15" x2="9" y2="17"/><line x1="6" y1="17" x2="12" y2="17"/>
  </svg>`;
}
function iconX() {
  return `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
    <line x1="3" y1="3" x2="13" y2="13"/><line x1="13" y1="3" x2="3" y2="13"/>
  </svg>`;
}
