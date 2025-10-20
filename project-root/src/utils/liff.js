export const liffLink = (to = '') => {
  const id = process.env.LIFF_ID || process.env.LIFF_ID_AI || process.env.LIFF_ID_GAMES || process.env.LIFF_ID_PR || process.env.LIFF_ID_PO || process.env.LIFF_ID_APPROVE;
  if (!id) throw new Error('Missing LIFF_ID env');
  const trimmed = typeof to === 'string' ? to.trim() : '';
  if (!trimmed) {
    return `https://liff.line.me/${id}`;
  }
  return `https://liff.line.me/${id}?to=${encodeURIComponent(trimmed)}`;
};
