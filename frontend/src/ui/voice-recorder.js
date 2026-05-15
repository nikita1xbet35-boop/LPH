import { api } from '../lib/api.js';

function getSupportedAudioType() {
  const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  return types.find(t => MediaRecorder.isTypeSupported(t)) || '';
}

export function attachVoiceRecorder(composerEl, onSendMedia) {
  if (!navigator.mediaDevices?.getUserMedia) return;

  const micBtn = document.createElement('button');
  micBtn.className = 'btn-icon composer-mic';
  micBtn.title = 'Voice message';
  micBtn.innerHTML = iconMic();

  // Insert mic before the send button
  const sendBtn = composerEl.querySelector('.btn-icon:last-child');
  composerEl.insertBefore(micBtn, sendBtn);

  let recorder = null;
  let chunks = [];
  let timerInterval = null;
  let startTime = 0;
  let stream = null;

  // Recording overlay inside composer
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
    recorder.stop();
    await new Promise(r => { recorder.onstop = r; });
    stopStream();

    const dur = (Date.now() - startTime) / 1000;
    if (dur < 0.5) { hideRecording(); return; }

    const mimeType = chunks[0]?.type || getSupportedAudioType();
    const blob = new Blob(chunks, { type: mimeType });
    hideRecording();

    const form = new FormData();
    form.append('file', blob, 'voice.' + (mimeType.includes('mp4') ? 'm4a' : 'webm'));

    try {
      const { url } = await api.upload(form);
      onSendMedia({ t: 'audio', url, dur: Math.round(dur) });
    } catch (e) {
      alert('Upload failed: ' + e.message);
    }
    recorder = null;
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
