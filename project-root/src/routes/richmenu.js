// src/routes/richmenu.js
import express from 'express';
import { listRichMenus, createOrUpdateRichMenu, deleteAllRichMenus } from '../services/richmenu.js';

const router = express.Router();

// ป้องกันด้วย session เบื้องต้น (แยกจาก admin.js)
function requireAuth(req, res, next) {
  if (req.session?.user) return next();
  return res.redirect('/admin/login');
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
