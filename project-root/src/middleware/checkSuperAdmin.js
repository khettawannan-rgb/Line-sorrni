import dotenv from 'dotenv';

dotenv.config();

const SUPER_ADMIN_UID = 'U3cbb8e21f7603d7eaa5a88cbba51c77b';
const COOKIE_NAME = 'super_admin_uid';
const BASE_URL = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : '';

function parseCookies(req) {
  const header = req.headers?.cookie || '';
  return header.split(';').reduce((acc, pair) => {
    const trimmed = pair.trim();
    if (!trimmed) return acc;
    const idx = trimmed.indexOf('=');
    if (idx === -1) {
      acc[trimmed] = '';
    } else {
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      acc[key] = decodeURIComponent(value);
    }
    return acc;
  }, {});
}

function isLineMobile(userAgent = '') {
  const ua = userAgent.toLowerCase();
  return ua.includes('line') && ua.includes('mobile');
}

function rememberSuperAdmin(req, res) {
  if (req.session) req.session.superAdminUid = SUPER_ADMIN_UID;
  if (typeof res.cookie === 'function') {
    const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production';
    res.cookie(COOKIE_NAME, SUPER_ADMIN_UID, {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}

function resolveRedirectPath() {
  return BASE_URL ? `${BASE_URL}/admin/pr` : '/admin/pr';
}

export function isSuperAdminSession(req) {
  if (req.session?.superAdminUid === SUPER_ADMIN_UID) return true;
  const cookies = parseCookies(req);
  if (cookies[COOKIE_NAME] === SUPER_ADMIN_UID) {
    if (req.session) req.session.superAdminUid = SUPER_ADMIN_UID;
    return true;
  }
  return false;
}

export function checkSuperAdmin(req, res, next) {
  const userAgent = req.headers['user-agent'] || '';
  const queryUid = typeof req.query?.uid === 'string' ? req.query.uid : '';
  const sessionUid = req.session?.superAdminUid || '';
  const cookies = parseCookies(req);
  const cookieUid = cookies[COOKIE_NAME] || '';
  const detectedUid = queryUid || sessionUid || cookieUid;
  const lineMobile = isLineMobile(userAgent);
  const isDev = (process.env.NODE_ENV || '').toLowerCase() !== 'production';
  const allowBypass = detectedUid === SUPER_ADMIN_UID && (lineMobile || isDev);

  console.log('[checkSuperAdmin]', { queryUid, sessionUid, cookieUid, userAgent, lineMobile, allowBypass });

  if (allowBypass) {
    console.log('[checkSuperAdmin] Super Admin detected — bypassing login.');
    rememberSuperAdmin(req, res);
    return res.redirect(resolveRedirectPath());
  }

  next();
}
