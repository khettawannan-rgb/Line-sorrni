// Static config with graceful fallback when no LIFF IDs injected at build time
(function(){
  function valOrPlaceholder(v, placeholder){
    const s = typeof v === 'string' ? v : placeholder;
    return s;
  }
  const raw = {
    PR: valOrPlaceholder(undefined, 'LIFF_ID_PR_PLACEHOLDER'),
    PO: valOrPlaceholder(undefined, 'LIFF_ID_PO_PLACEHOLDER'),
    APPROVE: valOrPlaceholder(undefined, 'LIFF_ID_APPROVE_PLACEHOLDER'),
    GAMES: valOrPlaceholder(undefined, 'LIFF_ID_GAMES_PLACEHOLDER'),
  };

  // Sanitize: if any value looks like a placeholder, turn it into empty string
  const clean = Object.fromEntries(Object.entries(raw).map(([k,v]) => {
    const str = String(v || '');
    const isPlaceholder = !str || /PLACEHOLDER/i.test(str) || str.length < 8;
    return [k, isPlaceholder ? '' : str];
  }));

  window.__LIFF__ = Object.assign({}, window.__LIFF__ || {}, clean);
})();
