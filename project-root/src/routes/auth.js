// src/routes/auth.js
import express from 'express';

const router = express.Router();

// ใช้ค่าจาก .env (ถ้าเว้นว่างจะ fallback เป็น admin/admin123)
const ADMIN_USER = (process.env.ADMIN_USER || 'admin').trim();
const ADMIN_PASS = (process.env.ADMIN_PASS || 'admin123').trim();

// ให้ตัวแปร user ใช้ได้ในทุก view (กัน "user is not defined")
router.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  next();
});

// GET /auth/login
router.get('/login', (req, res) => {
  const flash = req.session?.flash || {};
  if (req.session?.flash) delete req.session.flash;
  res.render('login', { error: flash.error || null });
});

// POST /auth/login
router.post('/login', express.urlencoded({ extended: true }), (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    req.session.user = { username: ADMIN_USER };
    return res.redirect('/admin');
  }
  req.session.flash = { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' };
  return res.redirect('/auth/login');
});

// GET /auth/logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
});

// (ถ้าหน้าไหนต้องล็อกอินก่อนใช้ ก็ export ไว้ให้ admin.js เรียกได้)
export function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/auth/login');
}

export default router;
