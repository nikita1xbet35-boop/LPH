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
    user-select: none;
    -webkit-user-select: none;
  `;
  overlay.innerHTML = `
    <div style="font-size:48px">🔒</div>
    <div style="color:#333;font-size:13px;font-family:monospace;letter-spacing:2px">dolboeb</div>
  `;
  document.body.appendChild(overlay);

  function show() {
    overlay.style.display = 'flex';
  }
  function hide() {
    overlay.style.display = 'none';
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) show(); else hide();
  });

  // Защита при выходе из фокуса (на некоторых устройствах)
  window.addEventListener('blur', show);
  window.addEventListener('focus', hide);
}
