window.__LIFF__ = window.__LIFF__ || {
  PR: typeof process !== 'undefined' && process.env?.LIFF_ID_PR ? process.env.LIFF_ID_PR : 'LIFF_ID_PR_PLACEHOLDER',
  PO: typeof process !== 'undefined' && process.env?.LIFF_ID_PO ? process.env.LIFF_ID_PO : 'LIFF_ID_PO_PLACEHOLDER',
  APPROVE: typeof process !== 'undefined' && process.env?.LIFF_ID_APPROVE ? process.env.LIFF_ID_APPROVE : 'LIFF_ID_APPROVE_PLACEHOLDER',
};
