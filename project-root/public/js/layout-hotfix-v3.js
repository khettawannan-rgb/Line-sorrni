/* layout-hotfix-v3.js – hotfix layout helpers */
(() => {
  const root = document.documentElement;
  const header = document.querySelector('.app-header, .topbar, header');

  const setH = () => {
    const h = header?.offsetHeight || 64;
    root.style.setProperty('--app-header-h', `${h}px`);
  };

  if (window.ResizeObserver && header) {
    const observer = new ResizeObserver(() => requestAnimationFrame(setH));
    observer.observe(header);
  } else {
    addEventListener('load', setH, { once: true });
    addEventListener('resize', () => requestAnimationFrame(setH));
  }
  setH();

  const img = document.querySelector('.brand-logo img, .auth-brand img');
  if (img) {
    const host = () => img.closest('.brand-logo, .auth-brand');
    const enableFallback = () => {
      console.warn('[hotfix] Login logo missing, enabling bg fallback.');
      host()?.classList.add('is-bg-fallback');
    };

    if (img.complete && !img.naturalWidth) {
      enableFallback();
    } else {
      img.addEventListener('error', enableFallback, { once: true });
    }
  }
})();
