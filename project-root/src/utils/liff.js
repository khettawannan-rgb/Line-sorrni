export const liffLink = (to = '') => {
  const id = process.env.LIFF_ID;
  if (!id) throw new Error('Missing LIFF_ID env');
  const trimmed = typeof to === 'string' ? to.trim() : '';
  if (!trimmed) {
    return `https://liff.line.me/${id}`;
  }
  return `https://liff.line.me/${id}?to=${encodeURIComponent(trimmed)}`;
};
