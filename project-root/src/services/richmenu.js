// src/services/richmenu.js
import axios from 'axios';
import fs from 'fs';

const LINE_API = 'https://api.line.me/v2/bot';
const TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

function auth() {
  if (!TOKEN) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is empty');
  return { Authorization: `Bearer ${TOKEN}` };
}

export async function listRichMenus() {
  const res = await axios.get(`${LINE_API}/richmenu/list`, { headers: auth() });
  return res.data?.richmenus || [];
}

export async function deleteAllRichMenus() {
  const menus = await listRichMenus();
  for (const m of menus) {
    await axios.delete(`${LINE_API}/richmenu/${m.richMenuId}`, { headers: auth() });
  }
  return { ok: true, deleted: menus.length };
}

export async function createOrUpdateRichMenu() {
  // ขนาดเต็ม 2500x1686 แบ่งปุ่มแบบ 3 คอลัมน์ x 2 แถว
  const size = { width: 2500, height: 1686 };
  const col = Math.floor(size.width / 3);
  const row = Math.floor(size.height / 2);

  // ปุ่ม (ส่งเป็น "ข้อความ") ให้ไปทางข้อความที่ระบบรองรับอยู่แล้ว
  const areas = [
    // แถวบน: วันนี้ / เมื่อวาน / สัปดาห์นี้
    { bounds: { x: col*0, y: row*0, width: col, height: row },
      action: { type: 'message', label: 'วันนี้', text: 'สรุป วันนี้' } },
    { bounds: { x: col*1, y: row*0, width: col, height: row },
      action: { type: 'message', label: 'เมื่อวาน', text: 'สรุป เมื่อวาน' } },
    { bounds: { x: col*2, y: row*0, width: col, height: row },
      action: { type: 'message', label: 'สัปดาห์นี้', text: 'สรุป สัปดาห์นี้' } },

    // แถวล่าง: เดือนนี้ / เปิดเมนู (มี Quick Reply เลือกวัน/ช่วง) / ช่วยเหลือ
    { bounds: { x: col*0, y: row*1, width: col, height: row },
      action: { type: 'message', label: 'เดือนนี้', text: 'สรุป เดือนนี้' } },
    { bounds: { x: col*1, y: row*1, width: col, height: row },
      action: { type: 'message', label: 'เมนู', text: 'เมนู' } },
    { bounds: { x: col*2, y: row*1, width: col, height: row },
      action: { type: 'message', label: 'ช่วยเหลือ', text: 'เมนู' } },
  ];

  // 1) สร้าง rich menu object
  const payload = {
    size,
    selected: false,               // จะตั้งเป็น default หลังอัปโหลดรูป
    name: 'ERP Daily Summary',
    chatBarText: 'เมนูสรุป',
    areas
  };
  const createRes = await axios.post(`${LINE_API}/richmenu`, payload, {
    headers: { 'Content-Type': 'application/json', ...auth() }
  });
  const richMenuId = createRes.data?.richMenuId;
  if (!richMenuId) throw new Error('Create richmenu failed');

  // 2) อัปโหลดรูป
  const imgPath = 'src/assets/Rich menu1.png';
  await axios.post(`${LINE_API}/richmenu/${richMenuId}/content`,
    fs.createReadStream(imgPath),
    { headers: { 'Content-Type': 'image/png', ...auth() } }
  );

  // 3) ตั้งเป็น default ให้ทุก user
  await axios.post(`${LINE_API}/user/all/richmenu/${richMenuId}`, null, { headers: auth() });

  return { ok: true, richMenuId };
}
