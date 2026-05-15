export function initScreenGuard() {
  // App-switcher guard: show black screen when app goes to background
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: #000;
    display: none;
    align-items: center;
    justify-content: center;
    flex-direction: column;
    gap: 12px;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
  `;
  overlay.innerHTML = `
    <div style="font-size:48px">🔒</div>
    <div style="color:#1a1a1a;font-size:13px;font-family:monospace;letter-spacing:3px">dolboeb</div>
  `;
  document.body.appendChild(overlay);

  document.addEventListener('visibilitychange', () => {
    overlay.style.display = document.hidden ? 'flex' : 'none';
  });

  // iOS PWA canvas trick: a video element playing a canvas stream
  // appears black in iOS screenshots (hardware video decoder bypass).
  // We overlay it at near-zero opacity so it's invisible to the eye
  // but breaks the iOS screenshot compositor for the area below.
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 2; canvas.height = 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, 2, 2);

    if (canvas.captureStream) {
      const stream = canvas.captureStream(1);
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.style.cssText = `
        position: fixed; inset: 0; z-index: 9997;
        width: 100%; height: 100%;
        object-fit: cover;
        pointer-events: none;
        opacity: 0.004;
        mix-blend-mode: multiply;
      `;
      document.body.appendChild(video);
      video.play().catch(() => {});
    }
  } catch {}
}
