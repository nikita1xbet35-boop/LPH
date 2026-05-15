export function initScreenGuard() {
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

  // Защита превью в переключателе приложений (iOS/Android)
  // Скрин во время работы приложения заблокировать на вебе невозможно
  document.addEventListener('visibilitychange', () => {
    overlay.style.display = document.hidden ? 'flex' : 'none';
  });
}
