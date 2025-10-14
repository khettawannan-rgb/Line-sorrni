const BASE_ORIGIN = (process.env.BASE_URL || '').replace(/\/$/, '');

export function sanitizeRedirect(target, fallback = '/admin') {
  if (typeof target !== 'string' || !target.trim()) return fallback;
  const trimmed = target.trim();
  if (trimmed.startsWith('http')) {
    try {
      const url = new URL(trimmed);
      if (BASE_ORIGIN && url.origin === BASE_ORIGIN) {
        return url.pathname + url.search + url.hash;
      }
    } catch (err) {
      return fallback;
    }
    return fallback;
  }
  if (!trimmed.startsWith('/')) return fallback;
  return trimmed;
}

export function escapeRegex(str = '') {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
