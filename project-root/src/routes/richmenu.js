// src/routes/richmenu.js
import express from 'express';
import { listRichMenus, createOrUpdateRichMenu, deleteAllRichMenus } from '../services/richmenu.js';
import { isSuperAdminSession } from '../middleware/checkSuperAdmin.js';

const router = express.Router();
const BASE_URL = process.env.BASE_URL ? process.env.BASE_URL.replace(/\/$/, '') : ''; // updated to use BASE_URL

// ป้องกันด้วย session เบื้องต้น (แยกจาก admin.js)
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  if (isSuperAdminSession(req)) return next();
  const target = BASE_URL ? `${BASE_URL}/admin/login` : '/admin/login'; // updated to use BASE_URL
  return res.redirect(target);
}

router.get('/richmenu', requireAuth, async (req, res) => {
  try {
    const menus = await listRichMenus();
    res.render('richmenu', { menus, result: null });
  } catch (err) {
    res.render('richmenu', { menus: [], result: { error: err.message || String(err) } });
  }
});

router.post('/richmenu/create', requireAuth, async (req, res) => {
  try {
    const r = await createOrUpdateRichMenu();
    const menus = await listRichMenus();
    res.render('richmenu', { menus, result: { ok: true, message: `สร้างและตั้งค่า default แล้ว: ${r.richMenuId}` } });
  } catch (err) {
    const menus = await listRichMenus().catch(()=>[]);
    res.render('richmenu', { menus, result: { error: err.message || String(err) } });
  }
});

router.post('/richmenu/delete', requireAuth, async (req, res) => {
  try {
    const r = await deleteAllRichMenus();
    const menus = await listRichMenus();
    res.render('richmenu', { menus, result: { ok: true, message: `ลบทั้งหมดแล้ว (${r.deleted})` } });
  } catch (err) {
    const menus = await listRichMenus().catch(()=>[]);
    res.render('richmenu', { menus, result: { error: err.message || String(err) } });
  }
});

export default router;
